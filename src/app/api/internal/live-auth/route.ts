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
import { startDiskHls } from "@/lib/hls-restream-client";

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

  const isHlsSegment = parsed.wantsHls && /\/hls\/seg\d+\.ts$/i.test(parsed.streamKey);

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? undefined;
  let cleanId = stripLiveStreamExtension(parsed.streamKey.split("/")[0] ?? parsed.streamKey);
  if (/^\d+$/.test(cleanId)) {
    const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
    const resolved = await resolveStreamIdParam(cleanId, { username: parsed.username });
    if (resolved) cleanId = resolved;
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

  if (!isHlsSegment) {
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
    const hlsNative = candidates.find((u) => isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    const tsUrl = candidates.find((u) => !isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    // Disk packager is for MPEG-TS only — never compete with provider-native HLS.
    if (tsUrl && !hlsNative) {
      startDiskHls({
        streamId: cleanId,
        upstreamUrl: tsUrl,
        userAgent: UPSTREAM_HLS_UA,
        outboundProxy,
      });
    }
    if (hlsNative) {
      schedulePlaybackUpstreamWarm(hlsNative, UPSTREAM_HLS_UA);
    }
    if ((req.headers.get("x-original-method") || "GET").toUpperCase() !== "HEAD" && !isHlsSegment) {
      void trackConnection({
        lineId: line.id,
        streamId: cleanId,
        ip: ip ?? "",
        userAgent: ua,
      });
    }
    return new NextResponse(null, {
      status: 200,
      headers: {
        "X-Nexlify-Stream-Id": cleanId,
        "X-Nexlify-Live": "1",
        "X-Nexlify-Hls": "1",
        ...(hlsNative ? { "X-Nexlify-Hls-Native": "1" } : {}),
        "Cache-Control": "no-store",
        ...proxyAuthHeaders(outboundProxy),
      } as Record<string, string>,
    });
  }

  const outboundProxy = await resolveStreamOutboundProxy(cleanId);
  const antiFreeze = await getAntiFreezeSettings();
  const ctx = { clientIp: ip, userAgent: ua, skipGeo: true };

  let upstream = "";
  if (parsed.spliceLiveTs) {
    const candidates = await resolvePlaybackUrlCandidatesForLine(
      line.id,
      cleanId,
      ctx,
      antiFreeze.playbackUrlCacheTtlSec
    );
    const ts = candidates.find((u) => !isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    if (ts) upstream = ts;
    else if (candidates.some((u) => isHlsPlaybackUrl(u))) {
      return new NextResponse(null, { status: 204, headers: { "X-Nexlify-Passthrough": "1" } });
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

  if ((req.headers.get("x-original-method") || "GET").toUpperCase() !== "HEAD") {
    void trackConnection({
      lineId: line.id,
      streamId: cleanId,
      ip: ip ?? "",
      userAgent: ua,
    });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "X-Nexlify-Upstream": upstream,
      "X-Nexlify-Live": parsed.spliceLiveTs ? "1" : "0",
      "Cache-Control": "no-store",
      ...proxyAuthHeaders(outboundProxy),
    } as Record<string, string>,
  });
}
