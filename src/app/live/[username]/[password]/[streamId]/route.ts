import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

import { isSessionKicked, attachKickAwareProxyBody } from "@/lib/connections";
import {
  buildLiveRedirectHeaders,
  getAntiFreezeSettings,
  scheduleZapPrefetch,
  schedulePlaybackUpstreamWarm,
} from "@/lib/anti-freeze";
import { getLineForPlaybackAuth, resolvePlaybackUrlCandidatesForLine } from "@/lib/line-playback";
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
  HLS_GUESSED_PROBE_MS,
  rewritePackagerPlaylist,
  expandHlsPlaybackCandidates,
  buildClientDirectHlsMaster,
  shouldOfferClientDirectHls,
  UPSTREAM_HLS_UA,
} from "@/lib/hls-playback";
import { serverBaseUrl } from "@/lib/xtream";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { createHlsToMpegTsStream } from "@/lib/hls-mpegts-relay";
import { cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";
import { openUpstreamLiveStream, liveMpegTsResponseHeaders, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { ensureDiskHls } from "@/lib/hls-restream-client";
import { getActiveTranscodingProfile } from "@/lib/transcoding-profiles";
import { getStreamPlaybackMode } from "@/lib/stream-playback-mode";
import { localHlsIndexPath } from "@/lib/ts-hls-packager";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROXY_TIMEOUT_MS = 30_000;

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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const { username, password, streamId } = await ctx.params;
  const requestStreamKey = stripLiveStreamExtension(streamId);
  let cleanId = requestStreamKey;
  const ip = getClientIp(req);

  // Xtream apps often request /live/user/pass/<numeric_hash>.ts — map back to cuid via SQL
  if (/^\d+$/.test(cleanId)) {
    const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
    const resolved = await resolveStreamIdParam(cleanId, { username });
    if (resolved) cleanId = resolved;
  }

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password) {
    return iptvText("Unauthorized", { status: 401 });
  }
  if (!lineIsPlayable(line)) {
    const { resolveLineGateVideo } = await import("@/lib/line-gate-video");
    const gate = await resolveLineGateVideo(line);
    if (gate?.redirectUrl) {
      return NextResponse.redirect(gate.redirectUrl, 302);
    }
    if (gate?.videoUrl) {
      return NextResponse.redirect(gate.videoUrl, 302);
    }
    return iptvText(gate?.message ?? "Unauthorized", { status: 403 });
  }

  const ua = req.headers.get("user-agent") ?? undefined;

  const { checkDdosShield } = await import("@/lib/ddos-shield");
  const ddos = await checkDdosShield(ip);
  if (!ddos.ok) return iptvText("Access temporarily blocked", { status: 429 });

  const { checkLineIpAccess } = await import("@/lib/line-ip-lock");
  if (!checkLineIpAccess(line, ip)) return iptvText("IP not allowed", { status: 403 });

  if (!checkLineUserAgent(line, ua)) {
    return iptvText("User-Agent not allowed for this line", { status: 403 });
  }

  if (await isSessionKicked(line.id, ip)) {
    return withIptvCors(iptvText("Session kicked", { status: 403 }));
  }

  const { lineHasConnectionCapacity } = await import("@/lib/connections");
  const hasCapacity = await lineHasConnectionCapacity(line.id, line.maxConnections, {
    streamId: cleanId,
    clientIp: ip,
  });
  if (!hasCapacity) {
    return iptvText(
      "Max connections reached. You are using all allowed streams. Please disconnect another device or increase your connection limit in the panel.",
      { status: 403 }
    );
  }

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
      const manifest = await fetchHlsManifestForClient(playbackUrl, UPSTREAM_HLS_UA, HLS_NATIVE_PROBE_MS);
      if (!manifest.ok) {
        lastError = manifest.detail || "Stream unavailable";
        if (
          !clientDirectHls &&
          shouldOfferClientDirectHls(manifest.status, manifest.detail)
        ) {
          clientDirectHls = playbackUrl;
        }
        continue;
      }
      return returnNativeHls(playbackUrl, manifest);
    }

    const tsUrls = [...originalCandidates].filter((u) => !isHlsPlaybackUrl(u));
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

    const packageTs = async (upstreamUrl: string) => {
      const streamMeta = await streamMetaPromise;
      const mode = streamMeta ? getStreamPlaybackMode(streamMeta) : "direct";
      const transcode = mode === "transcode" ? await getActiveTranscodingProfile() : null;
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), upstreamUrl, 3600);
      return ensureDiskHls({
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
      });
    };

    const packagerPromise = tsUrls[0] ? packageTs(tsUrls[0]!) : null;

    for (const playbackUrl of candidates) {
      if (!isHlsPlaybackUrl(playbackUrl) || originalCandidates.has(playbackUrl)) continue;
      const manifest = await fetchHlsManifestForClient(playbackUrl, UPSTREAM_HLS_UA, HLS_GUESSED_PROBE_MS);
      if (!manifest.ok) {
        lastError = manifest.detail || "Stream unavailable";
        continue;
      }
      return returnNativeHls(playbackUrl, manifest);
    }

    for (let i = 0; i < tsUrls.length; i++) {
      const packed = i === 0 && packagerPromise ? await packagerPromise : await packageTs(tsUrls[i]!);
      if (packed.ok) {
        const body = rewritePackagerPlaylist(
          packed.playlist,
          panelOrigin,
          username,
          password,
          requestStreamKey
        );
        return hlsHeaders(body);
      }
      lastError = packed.error;
    }

    const directHls = clientDirectHls;
    if (directHls) {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), directHls, 3600);
      return hlsHeaders(buildClientDirectHlsMaster(directHls));
    }

    const status = /timeout/i.test(lastError) ? 504 : 502;
    return withIptvCors(iptvText(lastError.slice(0, 200) || "Stream fetch failed", { status }));
  }

  for (let i = 0; i < candidates.length; i++) {
    const playbackUrl = candidates[i]!;

    if (isHlsPlaybackUrl(playbackUrl)) {
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
      const localIndex = localHlsIndexPath(cleanId);
      const remux = await createHlsToMpegTsStream({
        hlsUrl: localIndex || playbackUrl,
        lineId: line.id,
        streamId: cleanId,
        clientIp: ip,
        userAgent: UPSTREAM_HLS_UA,
      });
      if ("error" in remux) {
        lastError = remux.error;
        void logActivity("stream_hls_relay_error", {
          lineId: line.id,
          entity: "stream",
          entityId: cleanId,
          meta: { mode: "mpegts_remux", error: remux.error, candidate: i },
        });
        continue;
      }
      if (await isSessionKicked(line.id, ip)) {
        return withIptvCors(iptvText("Session kicked", { status: 403 }));
      }
      const remuxBody = attachKickAwareProxyBody({
        body: remux.stream as ReadableStream<Uint8Array>,
        lineId: line.id,
        streamId: cleanId,
        ip: ip ?? "",
        userAgent: ua,
      });
      return withIptvCors(
        new NextResponse(remuxBody as unknown as BodyInit, {
          status: 200,
          headers: {
            ...liveMpegTsResponseHeaders(remux.contentType),
            ...buildLiveRedirectHeaders(antiFreeze),
          },
        })
      );
    }

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
          const { prisma } = await import("@/lib/prisma");
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
    if (await isSessionKicked(line.id, ip)) {
      return withIptvCors(iptvText("Session kicked", { status: 403 }));
    }

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
