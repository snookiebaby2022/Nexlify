import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

import { isSessionKicked, attachKickAwareProxyBody, trackConnection } from "@/lib/connections";
import {
  buildLiveRedirectHeaders,
  getAntiFreezeSettings,
  scheduleZapPrefetch,
  schedulePlaybackUpstreamWarm,
} from "@/lib/anti-freeze";
import { getLineForPlaybackAuth, resolvePlaybackUrlCandidatesForLine, type LinePlaybackAuth } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import {
  fetchHlsManifestForClient,
  isHlsPlaybackUrl,
  isHlsClientPath,
  stripLiveStreamExtension,
  buildHlsRelayUrl,
  rewriteHlsManifestForRelay,
  hlsRelayCacheKey,
  hlsNativeUrlCacheKey,
  hlsPlaylistCacheKey,
  HLS_PLAYLIST_CONTENT_TYPE,
  HLS_NATIVE_PROBE_MS,
  HLS_NATIVE_PROBE_WARM_MS,
  HLS_PLAYLIST_CACHE_SEC,
  HLS_GUESSED_PROBE_MS,
  rewritePackagerPlaylist,
  buildClientDirectHlsMaster,
  shouldOfferClientDirectHls,
  expandHlsPlaybackCandidates,
  UPSTREAM_HLS_UA,
} from "@/lib/hls-playback";
import { serverBaseUrl } from "@/lib/xtream";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { cacheGet, cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";
import { openUpstreamLiveStream, liveMpegTsResponseHeaders, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { createHlsToMpegTsStream } from "@/lib/hls-mpegts-relay";
import { readReadyPackagerPlaylist } from "@/lib/ts-hls-packager";
import { ensureDiskHls } from "@/lib/hls-restream-client";
import { resolveOutboundProxyForStream } from "@/lib/outbound-proxy";
import type { OutboundProxy } from "@/lib/outbound-proxy";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROXY_TIMEOUT_MS = 15_000;

async function proxyUpstreamNative(
  url: string,
  ua: string | undefined,
  proxy?: OutboundProxy | null
): Promise<{ ok: true; response: NextResponse } | { ok: false; error: string }> {
  try {
    const open = await openUpstreamLiveStream(url, {
      userAgent: ua,
      timeoutMs: PROXY_TIMEOUT_MS,
      proxy,
    });
    const { stream, headers } = upstreamToWebResponse(open, undefined, { liveUnbounded: true });
    return {
      ok: true,
      response: new NextResponse(stream as unknown as BodyInit, { status: 200, headers }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stream fetch failed";
    if (/timeout/i.test(msg)) return { ok: false, error: "Stream timeout" };
    return { ok: false, error: msg || "Stream fetch failed" };
  }
}

export async function OPTIONS() {
  return iptvCorsPreflight();
}

type LiveAuthOk = {
  ok: true;
  username: string;
  password: string;
  streamId: string;
  requestStreamKey: string;
  cleanId: string;
  line: LinePlaybackAuth;
  ip: string | undefined;
  ua: string | undefined;
};

async function authorizeLivePlayback(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
): Promise<LiveAuthOk | { ok: false; response: NextResponse }> {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return { ok: false, response: demoBlock };

  const { username, password, streamId } = await ctx.params;
  const requestStreamKey = stripLiveStreamExtension(streamId);
  let cleanId = requestStreamKey;
  const ip = getClientIp(req);

  if (/^\d+$/.test(cleanId)) {
    const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
    const resolved = await resolveStreamIdParam(cleanId, { username });
    if (resolved) cleanId = resolved;
  }

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password) {
    return { ok: false, response: iptvText("Unauthorized", { status: 401 }) };
  }
  if (!lineIsPlayable(line)) {
    const { resolveLineGateVideo } = await import("@/lib/line-gate-video");
    const gate = await resolveLineGateVideo(line);
    if (gate?.redirectUrl) {
      return { ok: false, response: NextResponse.redirect(gate.redirectUrl, 302) };
    }
    if (gate?.videoUrl) {
      return { ok: false, response: NextResponse.redirect(gate.videoUrl, 302) };
    }
    return { ok: false, response: iptvText(gate?.message ?? "Unauthorized", { status: 403 }) };
  }

  const ua = req.headers.get("user-agent") ?? undefined;

  const { checkDdosShield } = await import("@/lib/ddos-shield");
  const ddos = await checkDdosShield(ip);
  if (!ddos.ok) return { ok: false, response: iptvText("Access temporarily blocked", { status: 429 }) };

  const { checkLineIpAccess } = await import("@/lib/line-ip-lock");
  if (!checkLineIpAccess(line, ip)) return { ok: false, response: iptvText("IP not allowed", { status: 403 }) };

  if (!checkLineUserAgent(line, ua)) {
    return { ok: false, response: iptvText("User-Agent not allowed for this line", { status: 403 }) };
  }

  const { lineHasConnectionCapacity } = await import("@/lib/connections");
  const [kicked, hasCapacity] = await Promise.all([
    isSessionKicked(line.id, ip),
    lineHasConnectionCapacity(line.id, line.maxConnections, {
      streamId: cleanId,
      clientIp: ip,
    }),
  ]);
  if (kicked) {
    return { ok: false, response: withIptvCors(iptvText("Session kicked", { status: 403 })) };
  }
  if (!hasCapacity) {
    return {
      ok: false,
      response: iptvText(
        "Max connections reached. You are using all allowed streams. Please disconnect another device or increase your connection limit in the panel.",
        { status: 403 }
      ),
    };
  }

  return { ok: true, username, password, streamId, requestStreamKey, cleanId, line, ip, ua };
}

function liveHeadHeaders(wantsM3u8: boolean, extra: Record<string, string>) {
  if (wantsM3u8) {
    return {
      ...extra,
      "Content-Type": HLS_PLAYLIST_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-store",
      "Accept-Ranges": "none",
    };
  }
  return {
    ...extra,
    ...liveMpegTsResponseHeaders("video/mp2t"),
  };
}

/**
 * VLC/XCIPTV sends HEAD before GET. Do not open upstream here — the IPTV edge
 * (or GET) serves MPEG-TS. A 302 on GET after a 200 HEAD also breaks VLC.
 */
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const auth = await authorizeLivePlayback(req, ctx);
  if (!auth.ok) return auth.response;
  const antiFreeze = await getAntiFreezeSettings();
  return withIptvCors(
    new NextResponse(null, {
      status: 200,
      headers: liveHeadHeaders(isHlsClientPath(auth.streamId), buildLiveRedirectHeaders(antiFreeze)),
    })
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const auth = await authorizeLivePlayback(req, ctx);
  if (!auth.ok) return auth.response;
  const { username, password, streamId, requestStreamKey, cleanId, line, ip, ua } = auth;
  const outboundProxy = await resolveOutboundProxyForStream(cleanId);

  const antiFreeze = await getAntiFreezeSettings();
  let candidates = await resolvePlaybackUrlCandidatesForLine(
    line.id,
    cleanId,
    { clientIp: ip, userAgent: ua, skipGeo: true },
    antiFreeze.playbackUrlCacheTtlSec
  );
  if (!candidates.length) return iptvText("Not found", { status: 404 });

  scheduleZapPrefetch(line.id, cleanId, { clientIp: ip, userAgent: ua }, antiFreeze);

  const wantsM3u8 = isHlsClientPath(streamId);

  const hlsHeaders = (body: string) =>
    withIptvCors(
      new NextResponse(body, {
        status: 200,
        headers: {
          ...buildLiveRedirectHeaders(antiFreeze),
          "Content-Type": HLS_PLAYLIST_CONTENT_TYPE,
          "Cache-Control": "no-cache, no-store",
          "Accept-Ranges": "none",
        },
      })
    );

  let lastError = "Stream fetch failed";
  let clientDirectHls: string | null = null;

  if (wantsM3u8) {
    const panelOrigin = serverBaseUrl(req.url, req.headers);
    const originalCandidates = new Set(candidates);
    const hasStoredNativeHls = candidates.some((u) => isHlsPlaybackUrl(u));
    const expanded = expandHlsPlaybackCandidates(candidates);
    const tsUrls = expanded.filter((u) => !isHlsPlaybackUrl(u));
    const hlsUrls = expanded.filter((u) => isHlsPlaybackUrl(u));

    const playlistKey = hlsPlaylistCacheKey(line.id, cleanId);
    const cachedPlaylist = await cacheGet<string>(playlistKey);
    if (cachedPlaylist) {
      return hlsHeaders(cachedPlaylist);
    }

    const cachedNativeUrl = await cacheGet<string>(hlsNativeUrlCacheKey(cleanId));

    const returnNativeHls = async (playbackUrl: string, manifest: { body: string; finalUrl: string }) => {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
      await cacheSet(hlsNativeUrlCacheKey(cleanId), playbackUrl, 3600);
      const relay = (url: string) =>
        buildHlsRelayUrl(panelOrigin, username, password, requestStreamKey, url);
      const body = rewriteHlsManifestForRelay(manifest.body, manifest.finalUrl, relay);
      await cacheSet(playlistKey, body, HLS_PLAYLIST_CACHE_SEC);
      if (antiFreeze.fastZapEnabled) {
        schedulePlaybackUpstreamWarm(playbackUrl, UPSTREAM_HLS_UA);
      }
      return hlsHeaders(body);
    };

    const orderedHlsUrls = cachedNativeUrl
      ? [cachedNativeUrl, ...hlsUrls.filter((u) => u !== cachedNativeUrl)]
      : hlsUrls;

    // 1. Provider-native HLS (stored .m3u8 in stream_source) before local remux.
    for (const playbackUrl of orderedHlsUrls) {
      const isKnownNative = playbackUrl === cachedNativeUrl;
      const probeMs = isKnownNative
        ? HLS_NATIVE_PROBE_WARM_MS
        : originalCandidates.has(playbackUrl)
          ? HLS_NATIVE_PROBE_MS
          : HLS_GUESSED_PROBE_MS;
      const manifest = await fetchHlsManifestForClient(playbackUrl, UPSTREAM_HLS_UA, probeMs);
      if (!manifest.ok) {
        lastError = manifest.detail || "Stream unavailable";
        if (
          !clientDirectHls &&
          originalCandidates.has(playbackUrl) &&
          shouldOfferClientDirectHls(manifest.status, manifest.detail)
        ) {
          clientDirectHls = playbackUrl;
        }
        continue;
      }
      return returnNativeHls(playbackUrl, manifest);
    }

    // 2. Warm disk packager playlist (MPEG-TS sources only — not when stream_source is native HLS).
    const existingPlaylist = !hasStoredNativeHls ? readReadyPackagerPlaylist(cleanId) : null;
    if (existingPlaylist) {
      if (tsUrls[0]) await cacheSet(hlsRelayCacheKey(line.id, cleanId), tsUrls[0], 3600);
      return hlsHeaders(
        rewritePackagerPlaylist(existingPlaylist, panelOrigin, username, password, requestStreamKey)
      );
    }

    // 3. MPEG-TS sources → ffmpeg disk packager (real HLS segments, not EXTINF:-1).
    for (const tsUrl of tsUrls) {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), tsUrl, 3600);
      if (antiFreeze.fastZapEnabled) {
        schedulePlaybackUpstreamWarm(tsUrl, UPSTREAM_HLS_UA);
      }
      const packed = await ensureDiskHls({
        streamId: cleanId,
        upstreamUrl: tsUrl,
        userAgent: UPSTREAM_HLS_UA,
        outboundProxy,
      });
      if (packed.ok) {
        return hlsHeaders(
          rewritePackagerPlaylist(packed.playlist, panelOrigin, username, password, requestStreamKey)
        );
      }
      lastError = packed.error;
    }

    // 4. Client-direct only for real stored .m3u8 (never guessed Xtream suffixes).
    if (clientDirectHls) {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), clientDirectHls, 3600);
      return hlsHeaders(buildClientDirectHlsMaster(clientDirectHls));
    }

    const status = /timeout/i.test(lastError) ? 504 : 502;
    return withIptvCors(iptvText(lastError.slice(0, 200) || "Stream fetch failed", { status }));
  }

  void trackConnection({ lineId: line.id, streamId: cleanId, ip: ip ?? "", userAgent: ua });

  const mpegTsOrder = expandHlsPlaybackCandidates([
    ...candidates.filter((u) => !isHlsPlaybackUrl(u)),
    ...candidates.filter((u) => isHlsPlaybackUrl(u)),
  ]).filter((u, i, arr) => arr.indexOf(u) === i);

  for (let i = 0; i < mpegTsOrder.length; i++) {
    const playbackUrl = mpegTsOrder[i]!;

    if (isHlsPlaybackUrl(playbackUrl)) {
      const remux = await createHlsToMpegTsStream({
        hlsUrl: playbackUrl,
        lineId: line.id,
        streamId: cleanId,
        clientIp: ip,
        userAgent: UPSTREAM_HLS_UA,
      });
      if ("error" in remux) {
        lastError = remux.error;
        continue;
      }
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
      return withIptvCors(
        new NextResponse(remux.stream as unknown as BodyInit, {
          status: 200,
          headers: {
            ...liveMpegTsResponseHeaders(remux.contentType),
            ...buildLiveRedirectHeaders(antiFreeze),
          },
        })
      );
    }

    const proxied = await proxyUpstreamNative(playbackUrl, UPSTREAM_HLS_UA, outboundProxy);
    if (!proxied.ok) {
      lastError = proxied.error;
      if (i === 0 && candidates.length > 1) {
        void logActivity("stream_primary_failover", {
          lineId: line.id,
          entity: "stream",
          entityId: cleanId,
          meta: { error: proxied.error },
        });
        try {
          await prisma.stream.update({
            where: { id: cleanId },
            data: {
              lastProbeOk: false,
              lastProbeError: proxied.error.slice(0, 500),
              lastProbeAt: new Date(),
            },
          });
        } catch {
          /* ignore probe bookkeeping */
        }
      }
      continue;
    }

    const response = proxied.response;
    const originalBody = response.body;
    if (originalBody) {
      const trackedBody = attachKickAwareProxyBody({
        body: originalBody,
        lineId: line.id,
        streamId: cleanId,
        ip: ip ?? "",
        userAgent: ua,
      });

      return withIptvCors(
        new NextResponse(trackedBody as unknown as BodyInit, {
          status: 200,
          headers: {
            ...liveMpegTsResponseHeaders(response.headers.get("content-type")),
            ...buildLiveRedirectHeaders(antiFreeze),
          },
        })
      );
    }

    return withIptvCors(response);
  }

  const status = /timeout/i.test(lastError) ? 504 : 502;
  return withIptvCors(iptvText(lastError.slice(0, 200) || "Stream fetch failed", { status }));
}
