import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

import { attachKickAwareProxyBody, trackConnection } from "@/lib/connections";
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
  raceHlsManifestProbes,
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
  expandHlsPlaybackCandidates,
  UPSTREAM_HLS_UA,
  instantLiveTsHlsPlaylist,
} from "@/lib/hls-playback";
import { serverBaseUrl } from "@/lib/xtream";
import { asPlaybackGuardLine, assertPlaybackAllowed, playbackDenyMessage } from "@/lib/playback-guard";
import { cacheGet, cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";
import { openUpstreamLiveStream, liveMpegTsResponseHeaders, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { createHlsToMpegTsStream } from "@/lib/hls-mpegts-relay";
import { readReadyPackagerPlaylist } from "@/lib/ts-hls-packager";
import { ensureDiskHls } from "@/lib/hls-restream-client";
import { resolveOutboundProxyForStream } from "@/lib/outbound-proxy";
import type { OutboundProxy } from "@/lib/outbound-proxy";
import { markStreamViewerPlaybackFailed, markStreamSpliceFailed } from "@/lib/viewer-playback-probe";
import { playbackFailKind } from "@/lib/live-playback-contract";
import { userAgentAllowsInstantTsWrap } from "@/lib/client-playback-profiles";

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
    if (!resolved) {
      return { ok: false, response: iptvText("Not found", { status: 404 }) };
    }
    cleanId = resolved;
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

  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua, {
    streamId: cleanId,
    hotPath: true,
  });
  if (deny) {
    const status = deny === "ddos" ? 429 : 403;
    const msg =
      deny === "connections"
        ? "Max connections reached. You are using all allowed streams. Please disconnect another device or increase your connection limit in the panel."
        : playbackDenyMessage(deny);
    return { ok: false, response: withIptvCors(iptvText(msg, { status })) };
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
  const wantsM3u8 = isHlsClientPath(auth.streamId);
  return withIptvCors(
    new NextResponse(null, {
      status: 200,
      headers: liveHeadHeaders(wantsM3u8, buildLiveRedirectHeaders(antiFreeze)),
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

  if (wantsM3u8) {
    void trackConnection({
      lineId: line.id,
      streamId: cleanId,
      ip: ip ?? "",
      userAgent: ua,
      playbackPath: `/live/${username}/${password}/${streamId}`,
      pruneOthers: true,
    });

    const panelOrigin = serverBaseUrl(req.url, req.headers);
    const originalCandidates = new Set(candidates);
    const hasStoredNativeHls = candidates.some((u) => isHlsPlaybackUrl(u));
    const expanded = expandHlsPlaybackCandidates(candidates);
    const tsUrls = expanded.filter((u) => !isHlsPlaybackUrl(u));
    const hlsUrls = expanded.filter((u) => isHlsPlaybackUrl(u));

    const playlistKey = hlsPlaylistCacheKey(line.id, cleanId);
    const instantStart = antiFreeze.liveInstantStart !== false;

    // Instant MPEG-TS wrap before native .m3u8 probes / ffmpeg. Dead provider
    // HLS plus packager wait is why only a warm channel (e.g. BBC One FHD) played.
    // Smarters/VLC cannot play this wrap (black screen) — they need real HLS.
    if (instantStart && tsUrls[0] && userAgentAllowsInstantTsWrap(ua)) {
      const tsName = `${stripLiveStreamExtension(requestStreamKey)}.ts`;
      if (antiFreeze.fastZapEnabled) {
        schedulePlaybackUpstreamWarm(tsUrls[0], UPSTREAM_HLS_UA);
      }
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), tsUrls[0], 3600);
      return hlsHeaders(instantLiveTsHlsPlaylist(tsName));
    }

    const cachedPlaylist = await cacheGet<string>(playlistKey);
    if (cachedPlaylist) {
      const cachedNativeUrl = await cacheGet<string>(hlsNativeUrlCacheKey(cleanId));
      if (cachedNativeUrl) {
        await cacheSet(hlsRelayCacheKey(line.id, cleanId), cachedNativeUrl, 3600);
      }
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

    // Provider-native HLS only when there is no MPEG-TS splice URL.
    const probeUrls = orderedHlsUrls.filter(
      (playbackUrl) => originalCandidates.has(playbackUrl) || playbackUrl === cachedNativeUrl
    );
    if (probeUrls.length) {
      const probeMsForUrl = (playbackUrl: string) => {
        const isKnownNative = playbackUrl === cachedNativeUrl;
        return isKnownNative
          ? HLS_NATIVE_PROBE_WARM_MS
          : originalCandidates.has(playbackUrl)
            ? HLS_NATIVE_PROBE_MS
            : HLS_GUESSED_PROBE_MS;
      };
      const winner = await raceHlsManifestProbes(
        probeUrls,
        UPSTREAM_HLS_UA,
        probeMsForUrl,
        outboundProxy
      );
      if (winner) {
        return returnNativeHls(winner.playbackUrl, { body: winner.body, finalUrl: winner.finalUrl });
      }
      lastError = "Stream unavailable";
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

    // 4. Repackage provider-native HLS via disk packager (XCIPTV/TiviMate cannot
    // reach many provider URLs directly; never redirect players off-panel).
    for (const hlsUrl of orderedHlsUrls) {
      if (!originalCandidates.has(hlsUrl)) continue;
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), hlsUrl, 3600);
      const packed = await ensureDiskHls({
        streamId: cleanId,
        upstreamUrl: hlsUrl,
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

    const status = /timeout/i.test(lastError) ? 504 : 502;
    return withIptvCors(iptvText(lastError.slice(0, 200) || "Stream fetch failed", { status }));
  }

  void trackConnection({
    lineId: line.id,
    streamId: cleanId,
    ip: ip ?? "",
    userAgent: ua,
    playbackPath: `/live/${username}/${password}/${streamId}`,
    pruneOthers: true,
  });

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
      const trackedBody = attachKickAwareProxyBody({
        body: remux.stream as unknown as ReadableStream<Uint8Array>,
        lineId: line.id,
        streamId: cleanId,
        ip: ip ?? "",
        userAgent: ua,
      });
      return withIptvCors(
        new NextResponse(trackedBody as unknown as BodyInit, {
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
        void import("@/lib/playback-quality-log").then(({ logPlaybackQuality, PLAYBACK_ORIGIN_FAIL }) =>
          logPlaybackQuality({
            action: PLAYBACK_ORIGIN_FAIL,
            streamId: cleanId,
            lineId: line.id,
            detail: proxied.error,
          })
        );
        try {
          const err = proxied.error.slice(0, 500);
          if (playbackFailKind(err) === "splice") {
            await markStreamSpliceFailed(cleanId, err);
          } else {
            await markStreamViewerPlaybackFailed(cleanId, err);
          }
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
