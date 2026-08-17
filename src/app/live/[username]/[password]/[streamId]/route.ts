import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

import { isSessionKicked, attachKickAwareProxyBody } from "@/lib/connections";
import {
  buildLiveRedirectHeaders,
  getAntiFreezeSettings,
  scheduleZapPrefetch,
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
import { openUpstreamLiveStream, resolvePlayableUpstreamUrl, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { ensureDiskHls, isHlsDaemonHealthy, openDaemonMpegTs } from "@/lib/hls-restream-client";
import { getActiveTranscodingProfile, getTranscodingProfiles } from "@/lib/transcoding-profiles";
import { getStreamPlaybackMode } from "@/lib/stream-playback-mode";
import { localHlsIndexPath } from "@/lib/hls-disk";
import { readLocalPackagerPlaylist } from "@/lib/ts-hls-packager";
import { prisma } from "@/lib/prisma";
import {
  matchTranscodingProfile,
  packagerDiskStreamId,
  parseLivePlaybackStreamKey,
  resolveTranscodeVariantNumeric,
} from "@/lib/transcode-live-urls";
import {
  ECO_DISK_PROFILE,
  ecoLiveProfile,
  getLiveBandwidthSettings,
  isEcoProfileHint,
  pickLowestBandwidthHlsVariant,
} from "@/lib/live-bandwidth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROXY_TIMEOUT_MS = 30_000;

function safeLocalHlsIndex(streamId: string): string | null {
  try {
    return localHlsIndexPath(streamId);
  } catch {
    return null;
  }
}

function safeReadLocalPackagerPlaylist(streamId: string): string | null {
  try {
    return readLocalPackagerPlaylist(streamId);
  } catch {
    return null;
  }
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
    const { stream, headers } = upstreamToWebResponse(open);
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
  const parsedKey = parseLivePlaybackStreamKey(streamId);
  let cleanId = parsedKey.token;
  let transcodeHint = parsedKey.profileHint;
  const ip = getClientIp(req);

  // Xtream apps often request /live/user/pass/<numeric_hash>.ts — map back to cuid via SQL
  if (/^\d+$/.test(cleanId)) {
    const variant = await resolveTranscodeVariantNumeric(parseInt(cleanId, 10), { username });
    if (variant) {
      cleanId = variant.streamId;
      transcodeHint = transcodeHint || variant.profileId;
    } else {
      const { resolveStreamIdParam } = await import("@/lib/xtream-stream-id");
      const resolved = await resolveStreamIdParam(cleanId, { username });
      if (resolved) cleanId = resolved;
    }
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
  const bw = await getLiveBandwidthSettings();
  if (wantsM3u8 && !bw.instantStart) {
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
        },
      })
    );

  const profiles = await getTranscodingProfiles();
  const hintedProfile = matchTranscodingProfile(transcodeHint, profiles);
  const explicitEco = isEcoProfileHint(transcodeHint);
  const ecoRequested = explicitEco || bw.saverEnabled;
  const streamMeta = await prisma.stream.findUnique({
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
  const mode = streamMeta ? getStreamPlaybackMode(streamMeta) : "direct";
  const modeTranscode = mode === "transcode" ? await getActiveTranscodingProfile() : null;
  const hlsProfile = explicitEco ? ecoLiveProfile(bw) : hintedProfile ?? modeTranscode;
  const mpegtsProfile = ecoRequested ? ecoLiveProfile(bw) : hintedProfile ?? modeTranscode;
  const hlsDiskStreamId = packagerDiskStreamId(cleanId, explicitEco ? ECO_DISK_PROFILE : hintedProfile);
  const diskStreamId = packagerDiskStreamId(cleanId, ecoRequested ? ECO_DISK_PROFILE : hintedProfile);
  const profileOpts = (
    profile: { resolution: string; bitrate: number; codec: string; gpuAcceleration: boolean } | null
  ) =>
    profile
      ? {
          resolution: profile.resolution,
          bitrate: profile.bitrate,
          codec: profile.codec,
          gpuAcceleration: profile.gpuAcceleration,
        }
      : null;
  const transcodeOpts = profileOpts(mpegtsProfile);

  let lastError = "Stream fetch failed";

  if (wantsM3u8) {
    const panelOrigin = serverBaseUrl(req.url, req.headers);
    const packedNow =
      safeReadLocalPackagerPlaylist(hlsDiskStreamId) ||
      (!explicitEco ? safeReadLocalPackagerPlaylist(cleanId) : null);
    if (packedNow) {
      return hlsHeaders(
        rewritePackagerPlaylist(packedNow, panelOrigin, username, password, requestStreamKey)
      );
    }

    let clientDirectHls: string | null = null;
    const hlsProbeMs = bw.instantStart ? 1_500 : 8_000;
    for (const playbackUrl of candidates) {
      if (!isHlsPlaybackUrl(playbackUrl)) continue;
      if (bw.instantStart && !originalCandidates.has(playbackUrl)) continue;
      const probeTimeoutMs = originalCandidates.has(playbackUrl) ? hlsProbeMs : 3_000;
      const manifest = await fetchHlsManifestForClient(playbackUrl, UPSTREAM_HLS_UA, probeTimeoutMs);
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
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
      const relay = (url: string) =>
        buildHlsRelayUrl(panelOrigin, username, password, requestStreamKey, url);
      let body = rewriteHlsManifestForRelay(manifest.body, manifest.finalUrl, relay);
      if (bw.saverEnabled) body = pickLowestBandwidthHlsVariant(body);
      return hlsHeaders(body);
    }

    for (const playbackUrl of candidates) {
      if (isHlsPlaybackUrl(playbackUrl)) continue;
      const resolved = await resolvePlayableUpstreamUrl(playbackUrl, {
        userAgent: UPSTREAM_HLS_UA,
        timeoutMs: bw.instantStart ? 2_000 : 8_000,
      });
      if (!resolved) {
        lastError = "Upstream is not MPEG-TS";
        continue;
      }
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), resolved, 3600);
      const packed = await ensureDiskHls({
        upstreamUrl: resolved,
        streamId: hlsDiskStreamId,
        userAgent: UPSTREAM_HLS_UA,
        loop: mode === "created" || Boolean(streamMeta?.isCreatedChannel),
        transcode: profileOpts(hlsProfile),
      });
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

  for (let i = 0; i < candidates.length; i++) {
    const playbackUrl = candidates[i]!;
    const localIndex =
      safeLocalHlsIndex(diskStreamId) || (!ecoRequested ? safeLocalHlsIndex(cleanId) : null);
    const useHlsRemux = Boolean(localIndex) || isHlsPlaybackUrl(playbackUrl);
    const mpegtsUrl = localIndex || playbackUrl;
    const daemonTranscode = localIndex ? null : transcodeOpts;
    await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);

    let daemonMpegts = await openDaemonMpegTs({
      streamId: diskStreamId,
      upstreamUrl: mpegtsUrl,
      lineId: line.id,
      clientIp: ip,
      userAgent: UPSTREAM_HLS_UA,
      hls: useHlsRemux,
      transcode: daemonTranscode,
      signal: req.signal,
    });
    if (!daemonMpegts?.ok && daemonTranscode) {
      daemonMpegts = await openDaemonMpegTs({
        streamId: diskStreamId,
        upstreamUrl: mpegtsUrl,
        lineId: line.id,
        clientIp: ip,
        userAgent: UPSTREAM_HLS_UA,
        hls: useHlsRemux,
        transcode: null,
        signal: req.signal,
      });
    }
    if (daemonMpegts?.ok) {
      if (await isSessionKicked(line.id, ip)) {
        return withIptvCors(iptvText("Session kicked", { status: 403 }));
      }
      const tracked = attachKickAwareProxyBody({
        body: daemonMpegts.body,
        lineId: line.id,
        streamId: cleanId,
        ip: ip ?? "",
        userAgent: ua,
      });
      return withIptvCors(
        new NextResponse(tracked as unknown as BodyInit, {
          status: 200,
          headers: {
            ...buildLiveRedirectHeaders(antiFreeze),
            "Content-Type": daemonMpegts.contentType,
            "Cache-Control": "no-cache, no-store",
            Connection: "keep-alive",
          },
        })
      );
    }
    if (await isHlsDaemonHealthy()) {
      lastError = daemonMpegts?.error || "MPEGTS daemon failed";
      continue;
    }

    if (useHlsRemux) {
      const remux = await createHlsToMpegTsStream({
        hlsUrl: mpegtsUrl,
        lineId: line.id,
        streamId: diskStreamId,
        clientIp: ip,
        userAgent: UPSTREAM_HLS_UA,
        transcode: daemonTranscode,
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
            ...buildLiveRedirectHeaders(antiFreeze),
            "Content-Type": remux.contentType,
            "Cache-Control": "no-cache, no-store",
            Connection: "keep-alive",
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
            ...buildLiveRedirectHeaders(antiFreeze),
            ...Object.fromEntries(response.headers.entries()),
          },
        })
      );
    }

    return withIptvCors(response);
  }

  const status = /timeout/i.test(lastError) ? 504 : 502;
  return withIptvCors(iptvText(lastError.slice(0, 200) || "Stream fetch failed", { status }));
}
