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
  HLS_PLAYLIST_CONTENT_TYPE,
  HLS_NATIVE_PROBE_MS,
  rewritePackagerPlaylist,
  expandHlsPlaybackCandidates,
  buildClientDirectHlsMaster,
  shouldOfferClientDirectHls,
  UPSTREAM_HLS_UA,
  rewriteLivePathToHls,
  xuiDirectSourceLocation,
} from "@/lib/hls-playback";
import { serverBaseUrl } from "@/lib/xtream";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";
import { openUpstreamLiveStream, liveMpegTsResponseHeaders, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { ensureDiskHls, startDiskHls } from "@/lib/hls-restream-client";
import { getActiveTranscodingProfile } from "@/lib/transcoding-profiles";
import { getStreamPlaybackMode } from "@/lib/stream-playback-mode";
import { readReadyPackagerPlaylist, waitForReadyPackagerPlaylist } from "@/lib/ts-hls-packager";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROXY_TIMEOUT_MS = 30_000;
const HLS_PACKAGER_WAIT_MS = 3_500;

function xuiDirectRedirect(url: string, extra?: Record<string, string>) {
  const location = xuiDirectSourceLocation(url);
  if (!location) return null;
  return withIptvCors(
    new NextResponse(null, {
      status: 302,
      headers: {
        Location: location,
        "Cache-Control": "no-store",
        ...(extra ?? {}),
      },
    })
  );
}

async function proxyUpstreamNative(
  url: string,
  ua: string | undefined
): Promise<{ ok: true; response: NextResponse } | { ok: false; error: string }> {
  try {
    const open = await openUpstreamLiveStream(url, {
      userAgent: ua,
      timeoutMs: PROXY_TIMEOUT_MS,
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
 * VLC/XCIPTV sends HEAD before GET. A 200 here plus a 302 on GET breaks VLC.
 * Match XUI.one direct-source: HEAD 302 to stream_source when the URL is public.
 */
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const auth = await authorizeLivePlayback(req, ctx);
  if (!auth.ok) return auth.response;
  const antiFreeze = await getAntiFreezeSettings();
  const extra = buildLiveRedirectHeaders(antiFreeze);
  const candidates = await resolvePlaybackUrlCandidatesForLine(
    auth.line.id,
    auth.cleanId,
    { clientIp: auth.ip, userAgent: auth.ua },
    antiFreeze.playbackUrlCacheTtlSec
  );
  const first = candidates[0];
  if (first) {
    const direct = xuiDirectRedirect(first, extra);
    if (direct) return direct;
  }
  return withIptvCors(
    new NextResponse(null, {
      status: 200,
      headers: liveHeadHeaders(isHlsClientPath(auth.streamId), extra),
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

  const antiFreeze = await getAntiFreezeSettings();
  let candidates = await resolvePlaybackUrlCandidatesForLine(
    line.id,
    cleanId,
    { clientIp: ip, userAgent: ua },
    antiFreeze.playbackUrlCacheTtlSec
  );
  if (!candidates.length) return iptvText("Not found", { status: 404 });

  scheduleZapPrefetch(line.id, cleanId, { clientIp: ip, userAgent: ua }, antiFreeze);

  const wantsM3u8 = isHlsClientPath(streamId);
  const originalCandidates = new Set(candidates);
  if (wantsM3u8) {
    candidates = expandHlsPlaybackCandidates(candidates);
  }

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

  const streamMetaPromise = prisma.stream.findUnique({
    where: { id: cleanId },
    select: {
      isCreatedChannel: true,
      vodMode: true,
      isOnDemand: true,
      agentStartCmd: true,
      autoRestart: true,
      streamUrl: true,
      hostedExternally: true,
    },
  });

  const packageOpts = async (upstreamUrl: string) => {
    const streamMeta = await streamMetaPromise;
    const mode = streamMeta ? getStreamPlaybackMode(streamMeta) : "direct";
    const transcode = mode === "transcode" ? await getActiveTranscodingProfile() : null;
    return {
      upstreamUrl,
      streamId: cleanId,
      userAgent: UPSTREAM_HLS_UA,
      loop: mode === "created" || Boolean(streamMeta?.isCreatedChannel),
      transcode: transcode
        ? {
            resolution: transcode.resolution,
            bitrate: transcode.bitrate,
            codec: transcode.codec,
            gpuAcceleration: transcode.gpuAcceleration,
          }
        : null,
    };
  };

  let lastError = "Stream fetch failed";
  let clientDirectHls: string | null = null;

  if (wantsM3u8) {
    const panelOrigin = serverBaseUrl(req.url, req.headers);
    const returnNativeHls = async (playbackUrl: string, manifest: { body: string; finalUrl: string }) => {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
      const relay = (url: string) =>
        buildHlsRelayUrl(panelOrigin, username, password, requestStreamKey, url);
      const body = rewriteHlsManifestForRelay(manifest.body, manifest.finalUrl, relay);
      if (antiFreeze.fastZapEnabled) {
        schedulePlaybackUpstreamWarm(playbackUrl, UPSTREAM_HLS_UA);
      }
      return hlsHeaders(body);
    };

    for (const playbackUrl of candidates) {
      if (!isHlsPlaybackUrl(playbackUrl) || !originalCandidates.has(playbackUrl)) continue;
      const direct = xuiDirectRedirect(playbackUrl, buildLiveRedirectHeaders(antiFreeze));
      if (direct) {
        await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
        if (antiFreeze.fastZapEnabled) {
          schedulePlaybackUpstreamWarm(playbackUrl, UPSTREAM_HLS_UA);
        }
        return direct;
      }
      const manifest = await fetchHlsManifestForClient(playbackUrl, UPSTREAM_HLS_UA, HLS_NATIVE_PROBE_MS);
      if (!manifest.ok) {
        lastError = manifest.detail || "Stream unavailable";
        if (!clientDirectHls && shouldOfferClientDirectHls(manifest.status, manifest.detail)) {
          clientDirectHls = playbackUrl;
        }
        continue;
      }
      return returnNativeHls(playbackUrl, manifest);
    }

    const tsUrls = [...originalCandidates].filter((u) => !isHlsPlaybackUrl(u));
    const existingPlaylist = readReadyPackagerPlaylist(cleanId);
    if (existingPlaylist) {
      if (tsUrls[0]) await cacheSet(hlsRelayCacheKey(line.id, cleanId), tsUrls[0], 3600);
      return hlsHeaders(
        rewritePackagerPlaylist(existingPlaylist, panelOrigin, username, password, requestStreamKey)
      );
    }

    if (tsUrls[0]) {
      const opts = await packageOpts(tsUrls[0]);
      startDiskHls(opts);
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), tsUrls[0], 3600);
      const waited = await waitForReadyPackagerPlaylist(cleanId, HLS_PACKAGER_WAIT_MS);
      if (waited) {
        return hlsHeaders(rewritePackagerPlaylist(waited, panelOrigin, username, password, requestStreamKey));
      }
      const directTs = xuiDirectRedirect(tsUrls[0], buildLiveRedirectHeaders(antiFreeze));
      if (directTs) return directTs;
    }

    for (const tsUrl of tsUrls) {
      const packed = await ensureDiskHls(await packageOpts(tsUrl));
      if (packed.ok) {
        return hlsHeaders(
          rewritePackagerPlaylist(packed.playlist, panelOrigin, username, password, requestStreamKey)
        );
      }
      lastError = packed.error;
    }

    if (clientDirectHls) {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), clientDirectHls, 3600);
      return hlsHeaders(buildClientDirectHlsMaster(clientDirectHls));
    }

    const status = /timeout/i.test(lastError) ? 504 : 502;
    return withIptvCors(iptvText(lastError.slice(0, 200) || "Stream fetch failed", { status }));
  }

  void trackConnection({ lineId: line.id, streamId: cleanId, ip: ip ?? "", userAgent: ua });

  for (let i = 0; i < candidates.length; i++) {
    const playbackUrl = candidates[i]!;

    if (isHlsPlaybackUrl(playbackUrl)) {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
      const directHls = xuiDirectRedirect(playbackUrl, buildLiveRedirectHeaders(antiFreeze));
      if (directHls) return directHls;
      return withIptvCors(NextResponse.redirect(rewriteLivePathToHls(req.url), 302));
    }

    const direct = xuiDirectRedirect(playbackUrl, buildLiveRedirectHeaders(antiFreeze));
    if (direct) return direct;

    const proxied = await proxyUpstreamNative(playbackUrl, UPSTREAM_HLS_UA);
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
