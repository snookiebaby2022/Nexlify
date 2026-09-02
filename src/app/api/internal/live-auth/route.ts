import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import { getClientIp } from "@/lib/client-ip";
import { getLineForPlaybackAuth, resolvePlaybackUrlCandidatesForLine, resolvePlaybackUrlForLine, type PlaybackContext } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { parseXtreamPlaybackPath } from "@/lib/xtream-playback-path";
import { stripLiveStreamExtension, isHlsPlaybackUrl, isSafeUpstreamUrl, UPSTREAM_HLS_UA } from "@/lib/hls-playback";
import { getAntiFreezeSettings, schedulePlaybackUpstreamWarm } from "@/lib/anti-freeze";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { isSessionKicked, trackConnection, isTestConnectionIp } from "@/lib/connections";
import { outboundProxyHeaderValue, resolveOutboundProxyForStream } from "@/lib/outbound-proxy";
import { isTinyLiveRangeProbe } from "@/lib/live-http-range";
import { isAutoSourceSwapEnabled } from "@/lib/source-failover";
import { getServerByAgentToken } from "@/lib/stream-agent";
import { prisma } from "@/lib/prisma";
import { streamUsesOnDemandWarmup } from "@/lib/stream-playback-policy";
import {
  getLiveAuthCache,
  setLiveAuthCache,
  type LiveAuthCacheEntry,
  type LiveAuthOutputMode,
} from "@/lib/live-auth-cache";
import { markStreamViewerPlaybackFailed } from "@/lib/viewer-playback-probe";

const LIVE_AUTH_RESOLVE_MS = 2500;

async function resolvePlaybackCandidatesFast(
  lineId: string,
  streamId: string,
  ctx: PlaybackContext,
  cacheTtlSec: number
): Promise<string[]> {
  try {
    return await Promise.race([
      resolvePlaybackUrlCandidatesForLine(lineId, streamId, ctx, cacheTtlSec),
      new Promise<string[]>((_, reject) =>
        setTimeout(() => reject(new Error("playback resolve timeout")), LIVE_AUTH_RESOLVE_MS)
      ),
    ]);
  } catch {
    const cached = await import("@/lib/cache").then(({ cacheGet }) =>
      cacheGet<string[]>(`playback:urls:${lineId}:${streamId}`)
    );
    return cached ?? [];
  }
}

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
 *  LibVLC `Range: bytes=0-` is live playback (XUI/1-stream ignore Range and splice).
 *  webOS/Tizen `Range: bytes=0-1` is also live playback — empty 200s 502 on the edge. */
function isLiveByteProbe(
  req: NextRequest,
  parsed: { spliceLiveTs?: boolean; wantsHls?: boolean },
  isHlsSegment: boolean
): boolean {
  const ua = req.headers.get("user-agent");
  if (originalMethod(req) === "HEAD") return true;
  if (isHlsSegment) return false;
  if (!parsed.spliceLiveTs) return false;
  return isTinyLiveRangeProbe(originalRange(req), ua);
}

async function resolveStreamOutboundProxy(streamId: string, agentServerScope: string | null = null) {
  // Stream-server edge already uses the LB IP; proxy is only for panel-local edge egress.
  if (agentServerScope) return null;
  return resolveOutboundProxyForStream(streamId);
}

function proxyAuthHeaders(proxy: Awaited<ReturnType<typeof resolveStreamOutboundProxy>>): Record<string, string> {
  const value = outboundProxyHeaderValue(proxy);
  return value ? { "X-Nexlify-Outbound-Proxy": value } : {};
}

function onDemandAuthHeaders(onDemand: boolean): Record<string, string> {
  return onDemand ? { "X-Nexlify-On-Demand": "1" } : {};
}

function liveAuthResponseFromCache(entry: LiveAuthCacheEntry): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "X-Nexlify-Line-Id": entry.lineId,
      "X-Nexlify-Stream-Id": entry.streamId,
      "X-Nexlify-Upstream": entry.upstream,
      ...(entry.alts.length
        ? { "X-Nexlify-Alts": entry.alts.map((u) => encodeURIComponent(u)).join(",") }
        : {}),
      "X-Nexlify-Live": entry.live ? "1" : "0",
      ...onDemandAuthHeaders(Boolean(entry.onDemand)),
      ...(entry.wantsHls ? { "X-Nexlify-Hls": "1" } : {}),
      ...(entry.hlsNative ? { "X-Nexlify-Hls-Native": "1" } : {}),
      "Cache-Control": "no-store",
      ...(entry.outboundProxy ? { "X-Nexlify-Outbound-Proxy": entry.outboundProxy } : {}),
    } as Record<string, string>,
  });
}

function liveAuthOutputMode(parsed: { wantsHls?: boolean }): LiveAuthOutputMode {
  return parsed.wantsHls ? "hls" : "ts";
}

/**
 * Loopback auth for the IPTV edge (XUI-style): 200 + X-Nexlify-Upstream, or passthrough to Next.
 */
export async function GET(req: NextRequest) {
  const agentToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const agentServerId = req.headers.get("x-nexlify-agent-server-id")?.trim() ?? "";
  let agentServerScope: string | null = null;
  if (agentToken && agentServerId) {
    const server = await getServerByAgentToken(agentToken);
    if (!server || server.id !== agentServerId) {
      return new NextResponse(null, { status: 403 });
    }
    agentServerScope = server.id;
  } else if (!isAuthorizedInternalRequest(req)) {
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

  if (agentServerScope) {
    const assigned = await import("@/lib/prisma").then(({ prisma }) =>
      prisma.stream.findFirst({
        where: { id: cleanId, serverId: agentServerScope, isActive: true },
        select: { id: true },
      })
    );
    if (!assigned) {
      return new NextResponse("Stream not on this server", { status: 404 });
    }
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

  const streamModeRow = await prisma.stream.findUnique({
    where: { id: cleanId },
    select: { vodMode: true, isOnDemand: true },
  });
  const onDemand = streamUsesOnDemandWarmup(streamModeRow ?? {});

  const isHlsSegment = parsed.wantsHls && /\/hls\/seg\d+\.ts$/i.test(parsed.streamKey);
  const liveProbe = isLiveByteProbe(req, parsed, isHlsSegment);
  const testIp = isTestConnectionIp(ip);

  // Load-test / smoke IPs: auth only — no slots, no upstream probes on HEAD.
  if (testIp && (liveProbe || originalMethod(req) === "HEAD")) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "X-Nexlify-Line-Id": line.id,
        "X-Nexlify-Stream-Id": cleanId,
        "X-Nexlify-Live": "1",
        ...onDemandAuthHeaders(onDemand),
        ...(parsed.wantsHls ? { "X-Nexlify-Hls": "1" } : {}),
        "Cache-Control": "no-store",
      } as Record<string, string>,
    });
  }

  if (liveProbe && parsed.spliceLiveTs && !parsed.wantsHls) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "X-Nexlify-Line-Id": line.id,
        "X-Nexlify-Stream-Id": cleanId,
        "X-Nexlify-Live": "1",
        ...onDemandAuthHeaders(onDemand),
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

  const method = originalMethod(req);
  const authOutputMode = liveAuthOutputMode(parsed);
  if (!liveProbe && method !== "HEAD" && !isHlsSegment) {
    const cached = await getLiveAuthCache(
      line.id,
      cleanId,
      ip,
      authOutputMode,
      agentServerScope
    );
    if (cached?.upstream && isSafeUpstreamUrl(cached.upstream)) {
      void trackConnection({
        lineId: line.id,
        streamId: cleanId,
        ip,
        userAgent: ua,
        playbackPath: originalPath(req),
        mediaBytes: parsed.wantsHls ? 48_000 : 220_000,
        pruneOthers: false,
      });
      return liveAuthResponseFromCache(cached);
    }
  }

  if (parsed.wantsHls) {
    if (liveProbe || method === "HEAD") {
      return new NextResponse(null, {
        status: 200,
        headers: {
          "X-Nexlify-Line-Id": line.id,
          "X-Nexlify-Stream-Id": cleanId,
          "X-Nexlify-Live": "1",
          "X-Nexlify-Hls": "1",
          ...onDemandAuthHeaders(onDemand),
          "Cache-Control": "no-store",
        } as Record<string, string>,
      });
    }
    const antiFreeze = await getAntiFreezeSettings();
    const ctx = { clientIp: ip, userAgent: ua, skipGeo: true };
    const candidates = await resolvePlaybackCandidatesFast(
      line.id,
      cleanId,
      ctx,
      antiFreeze.playbackUrlCacheTtlSec
    );
    const outboundProxy = await resolveStreamOutboundProxy(cleanId, agentServerScope);
    const tsUrl = candidates.find((u) => !isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    // Prefer MPEG-TS splice + instant playlist. Advertising native HLS here
    // forwarded every zap into Next.js (dead .m3u8 probe / ffmpeg packager),
    // which is why only a warm channel played.
    const hlsNative = tsUrl
      ? undefined
      : candidates.find((u) => isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
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
          pruneOthers: false,
        });
      }
    }
    const hlsUpstream = tsUrl ?? hlsNative;
    if (hlsUpstream) {
      void setLiveAuthCache(line.id, cleanId, ip, {
        upstream: hlsUpstream,
        alts: [],
        live: true,
        onDemand,
        hlsNative: Boolean(hlsNative && !tsUrl),
        wantsHls: true,
        lineId: line.id,
        streamId: cleanId,
        outputMode: "hls",
        serverId: agentServerScope,
        outboundProxy: outboundProxyHeaderValue(outboundProxy) ?? null,
      });
    }
    return new NextResponse(null, {
      status: 200,
      headers: {
        "X-Nexlify-Line-Id": line.id,
        "X-Nexlify-Stream-Id": cleanId,
        "X-Nexlify-Live": "1",
        "X-Nexlify-Hls": "1",
        ...onDemandAuthHeaders(onDemand),
        ...(hlsNative && !tsUrl ? { "X-Nexlify-Hls-Native": "1" } : {}),
        ...((tsUrl ?? hlsNative) ? { "X-Nexlify-Upstream": tsUrl ?? hlsNative! } : {}),
        "Cache-Control": "no-store",
        ...proxyAuthHeaders(outboundProxy),
      } as Record<string, string>,
    });
  }

  const outboundProxy = await resolveStreamOutboundProxy(cleanId, agentServerScope);
  const antiFreeze = await getAntiFreezeSettings();
  const ctx = { clientIp: ip, userAgent: ua, skipGeo: true };

  let upstream = "";
  let altUpstreams: string[] = [];
  if (parsed.spliceLiveTs) {
    const candidates = await resolvePlaybackCandidatesFast(
      line.id,
      cleanId,
      ctx,
      antiFreeze.playbackUrlCacheTtlSec
    );
    const tsList = candidates.filter((u) => !isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
    if (tsList.length) {
      upstream = tsList[0]!;
      altUpstreams = (await isAutoSourceSwapEnabled()) ? tsList.slice(1, 4) : [];
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
    if (!liveProbe && method !== "HEAD" && !isHlsSegment) {
      void markStreamViewerPlaybackFailed(cleanId, "No playable upstream URL for viewer");
    }
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
      pruneOthers: false,
    });
  }

  void setLiveAuthCache(line.id, cleanId, ip, {
    upstream,
    alts: altUpstreams,
    live: parsed.spliceLiveTs,
    onDemand,
    lineId: line.id,
    streamId: cleanId,
    outputMode: authOutputMode,
    serverId: agentServerScope,
    outboundProxy: outboundProxyHeaderValue(outboundProxy) ?? null,
  });

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
      ...onDemandAuthHeaders(onDemand),
      "Cache-Control": "no-store",
      ...proxyAuthHeaders(outboundProxy),
    } as Record<string, string>,
  });
}
