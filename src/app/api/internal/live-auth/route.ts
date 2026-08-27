import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import { getClientIp } from "@/lib/client-ip";
import { getLineForPlaybackAuth, resolvePlaybackUrlCandidatesForLine, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { parseXtreamPlaybackPath } from "@/lib/xtream-playback-path";
import { stripLiveStreamExtension, isHlsPlaybackUrl, isSafeUpstreamUrl, UPSTREAM_HLS_UA } from "@/lib/hls-playback";
import { getAntiFreezeSettings, schedulePlaybackUpstreamWarm } from "@/lib/anti-freeze";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { isSessionKicked, trackConnection } from "@/lib/connections";
import { outboundProxyHeaderValue, resolveOutboundProxyForStream } from "@/lib/outbound-proxy";
import { isTinyLiveRangeProbe } from "@/lib/live-http-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originalPath(req: NextRequest): string {
  const raw = req.headers.get("x-original-uri") || req.nextUrl.searchParams.get("uri") || "";
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return new URL(raw).pathname;
    }
  } catch {
    /* use as path */
  }
  return raw.split("?")[0] || "";
}

function originalMethod(req: NextRequest): string {
  return (req.headers.get("x-original-method") || req.method || "GET").toUpperCase();
}

function originalRange(req: NextRequest): string {
  return (req.headers.get("x-original-range") || req.headers.get("range") || "").trim();
}

/** HEAD or tiny finite Range probes during XCIPTV Update Content — do not occupy slots.
 *  LibVLC `Range: bytes=0-` is live playback (XUI/1-stream ignore Range and splice). */
function isLiveByteProbe(
  req: NextRequest,
  parsed: { spliceLiveTs?: boolean; wantsHls?: boolean },
  isHlsSegment: boolean
): boolean {
  if (originalMethod(req) === "HEAD") return true;
  if (isHlsSegment) return false;
  if (!parsed.spliceLiveTs) return false;
  return isTinyLiveRangeProbe(originalRange(req));
}

async function resolveStreamOutboundProxy(streamId: string) {
  return resolveOutboundProxyForStream(streamId);
}

function proxyAuthHeaders(proxy: Awaited<ReturnType<typeof resolveStreamOutboundProxy>>): Record<string, string> {
  const value = outboundProxyHeaderValue(proxy);
  return value ? { "X-Nexlify-Outbound-Proxy": value } : {};
}

/**
 * Loopback auth for the IPTV edge (XUI-style): 200 + X-Nexlify-Upstream, or passthrough to Next.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return new NextResponse(null, { status: 403 });
  }

  const parsed = parseXtreamPlaybackPath(originalPath(req));
  if (!parsed) {
    return new NextResponse(null, { status: 204, headers: { "X-Nexlify-Passthrough": "1" } });
  }

  if (parsed.kind === "timeshift" || (!parsed.spliceLiveTs && !parsed.spliceVod && !parsed.wantsHls)) {
    return new NextResponse(null, { status: 204, headers: { "X-Nexlify-Passthrough": "1" } });
  }

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? undefined;
  let cleanId = stripLiveStreamExtension(parsed.streamKey.split("/")[0] ?? parsed.streamKey);
  if (/^\d+$/.test(cleanId)) {
    const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
    const resolved = await resolveStreamIdParam(cleanId, { username: parsed.username });
    if (!resolved) {
      return new NextResponse("Not found", { status: 404 });
    }
    cleanId = resolved;
  }

  const line = await getLineForPlaybackAuth(parsed.username);
  if (!line || line.password !== parsed.password || !lineIsPlayable(line)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!checkLineUserAgent(line, ua)) {
    return new NextResponse("User-Agent not allowed for this line", { status: 403 });
  }
  if (await isSessionKicked(line.id, ip)) {
    return new NextResponse("Session kicked", { status: 403 });
  }

  const isHlsSegment = parsed.wantsHls && /\/hls\/seg\d+\.ts$/i.test(parsed.streamKey);
  const liveProbe = isLiveByteProbe(req, parsed, isHlsSegment);
  if (liveProbe && parsed.spliceLiveTs && !parsed.wantsHls) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "X-Nexlify-Line-Id": line.id,
        "X-Nexlify-Stream-Id": cleanId,
        "X-Nexlify-Live": "1",
        "Cache-Control": "no-store",
      } as Record<string, string>,
    });
  }
  if (!isHlsSegment && !liveProbe) {
    const { lineHasConnectionCapacity } = await import("@/lib/connections");
    const hasCapacity = await lineHasConnectionCapacity(line.id, line.maxConnections, {
      streamId: cleanId,
      clientIp: ip,
    });
    if (!hasCapacity) {
      return new NextResponse("Max connections reached", { status: 403 });
    }
  }

  if (parsed.wantsHls) {
    const antiFreeze = await getAntiFreezeSettings();
    const ctx = { clientIp: ip, userAgent: ua, skipGeo: true };
    const candidates = await resolvePlaybackUrlCandidatesForLine(
      line.id,
      cleanId,
      ctx,
      antiFreeze.playbackUrlCacheTtlSec
    );
    const outboundProxy = await resolveStreamOutboundProxy(cleanId);
    const tsUrl = candidates.find((u) => !isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    // Prefer MPEG-TS splice + instant playlist. Advertising native HLS here
    // forwarded every zap into Next.js (dead .m3u8 probe / ffmpeg packager),
    // which is why only a warm channel played.
    const hlsNative = tsUrl
      ? undefined
      : candidates.find((u) => isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    const method = originalMethod(req);
    // MPEG-TS live is spliced as .ts (or an instant HLS wrapper). Do not spawn
    // ffmpeg per zap — that is why only a warm channel (e.g. BBC One FHD) played.
    if (hlsNative) {
      schedulePlaybackUpstreamWarm(hlsNative, UPSTREAM_HLS_UA);
    } else if (tsUrl && method !== "HEAD" && !liveProbe) {
      schedulePlaybackUpstreamWarm(tsUrl, UPSTREAM_HLS_UA);
    }
    if (method !== "HEAD" && !liveProbe) {
      const path = originalPath(req);
      const isSeg = /\/hls\/seg\d+\.ts$/i.test(path);
      // HLS segments are keep-alive via edge pulse only — tracking each segment multiplies rows.
      if (!isSeg) {
        void trackConnection({
          lineId: line.id,
          streamId: cleanId,
          ip,
          userAgent: ua,
          playbackPath: path,
          mediaBytes: parsed.wantsHls ? 48_000 : 180_000,
          pruneOthers: true,
        });
      }
    }
    return new NextResponse(null, {
      status: 200,
      headers: {
        "X-Nexlify-Line-Id": line.id,
        "X-Nexlify-Stream-Id": cleanId,
        "X-Nexlify-Live": "1",
        "X-Nexlify-Hls": "1",
        ...(hlsNative && !tsUrl ? { "X-Nexlify-Hls-Native": "1" } : {}),
        ...((tsUrl ?? hlsNative) ? { "X-Nexlify-Upstream": tsUrl ?? hlsNative! } : {}),
        "Cache-Control": "no-store",
        ...proxyAuthHeaders(outboundProxy),
      } as Record<string, string>,
    });
  }

  const outboundProxy = await resolveStreamOutboundProxy(cleanId);
  const antiFreeze = await getAntiFreezeSettings();
  const ctx = { clientIp: ip, userAgent: ua, skipGeo: true };

  let upstream = "";
  let altUpstreams: string[] = [];
  if (parsed.spliceLiveTs) {
    const candidates = await resolvePlaybackUrlCandidatesForLine(
      line.id,
      cleanId,
      ctx,
      antiFreeze.playbackUrlCacheTtlSec
    );
    const tsList = candidates.filter((u) => !isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    if (tsList.length) {
      upstream = tsList[0]!;
      altUpstreams = tsList.slice(1, 4);
    } else {
      const hlsUrl = candidates.find((u) => isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
      if (hlsUrl) upstream = hlsUrl;
    }
  } else {
    upstream =
      (await resolvePlaybackUrlForLine(line.id, cleanId, ctx, antiFreeze.playbackUrlCacheTtlSec)) ?? "";
    if (upstream && isHlsPlaybackUrl(upstream)) {
      return new NextResponse(null, { status: 204, headers: { "X-Nexlify-Passthrough": "1" } });
    }
  }

  if (!upstream || !isSafeUpstreamUrl(upstream)) {
    return new NextResponse(null, { status: 204, headers: { "X-Nexlify-Passthrough": "1" } });
  }

  if (originalMethod(req) !== "HEAD" && !liveProbe) {
    void trackConnection({
      lineId: line.id,
      streamId: cleanId,
      ip,
      userAgent: ua,
      playbackPath: originalPath(req),
      mediaBytes: 220_000,
      pruneOthers: true,
    });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "X-Nexlify-Line-Id": line.id,
      "X-Nexlify-Stream-Id": cleanId,
      "X-Nexlify-Upstream": upstream,
      ...(altUpstreams.length
        ? { "X-Nexlify-Alts": altUpstreams.map((u) => encodeURIComponent(u)).join(",") }
        : {}),
      "X-Nexlify-Live": parsed.spliceLiveTs ? "1" : "0",
      "Cache-Control": "no-store",
      ...proxyAuthHeaders(outboundProxy),
    } as Record<string, string>,
  });
}
