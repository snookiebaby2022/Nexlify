import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
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
  freshPackagerPlaylistBody,
  readPackagerHlsSegmentBuffer,
  servePackagerHlsSegmentResponse,
} from "@/lib/hls-playback";
import { serverBaseUrl } from "@/lib/xtream";
import { checkLineUserAgent } from "@/lib/line-restrictions";
import { createHlsToMpegTsStream } from "@/lib/hls-mpegts-relay";
import { cacheGet, cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";
import {
  openUpstreamLiveStream,
  resolvePlayableUpstreamUrl,
  upstreamToWebResponse,
  looksLikeHlsManifestPayload,
  shouldSniffAccidentalHlsManifest,
  normalizeHlsManifestContentType,
  normalizeLiveMpegTsContentType,
} from "@/lib/live-upstream-proxy";
import { ensureDiskHls, isHlsDaemonHealthy, openDaemonMpegTs } from "@/lib/hls-restream-client";
import { getActiveTranscodingProfile, getTranscodingProfiles } from "@/lib/transcoding-profiles";
import { getStreamPlaybackMode } from "@/lib/stream-playback-mode";
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

async function readNodeStreamLimited(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
      if (total >= maxBytes) break;
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks, total);
}

function prependReadable(prefix: Buffer, stream: Readable): Readable {
  if (!prefix.length) return stream;
  return Readable.from(
    (async function* () {
      yield prefix;
      for await (const chunk of stream) {
        yield chunk;
      }
    })()
  );
}

function peekReadable(stream: Readable, maxBytes: number): Promise<{ prefix: Buffer; rest: Readable }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      stream.pause();
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
      resolve({ prefix: Buffer.concat(chunks, total), rest: stream });
    };
    const onData = (chunk: Buffer) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
      if (total >= maxBytes) finish();
    };
    const onEnd = () => finish();
    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
    if (stream.isPaused()) stream.resume();
  });
}

async function proxyUpstreamNative(
  url: string,
  ua: string | undefined,
  rewrite?: {
    panelOrigin: string;
    username: string;
    password: string;
    streamKey: string;
    saverEnabled: boolean;
  }
): Promise<{ ok: true; response: NextResponse } | { ok: false; error: string }> {
  try {
    const open = await openUpstreamLiveStream(url, {
      userAgent: ua,
      timeoutMs: PROXY_TIMEOUT_MS,
    });
    if (rewrite && shouldSniffAccidentalHlsManifest(open.contentType)) {
      const { prefix, rest } = await peekReadable(open.body, 512);
      if (looksLikeHlsManifestPayload(prefix)) {
        const more = await readNodeStreamLimited(rest, 2_000_000);
        const text = Buffer.concat([prefix, more]).toString("utf8");
        const relay = (target: string) =>
          buildHlsRelayUrl(rewrite.panelOrigin, rewrite.username, rewrite.password, rewrite.streamKey, target);
        let body = rewriteHlsManifestForRelay(text, open.finalUrl, relay);
        if (rewrite.saverEnabled) body = pickLowestBandwidthHlsVariant(body);
        return {
          ok: true,
          response: new NextResponse(body, {
            status: 200,
            headers: {
              "Content-Type": normalizeHlsManifestContentType(HLS_PLAYLIST_CONTENT_TYPE),
              "Cache-Control": "no-cache, no-store",
            },
          }),
        };
      }
      open.body = prependReadable(prefix, rest);
    }
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
  const hlsSegmentIndex = parsedKey.hlsSegmentIndex;
  const ip = getClientIp(req);

  // Xtream apps often request /live/user/pass/<numeric_hash>.ts — map back to cuid via SQL
  if (/^\d+$/.test(cleanId)) {
    const variant = await resolveTranscodeVariantNumeric(parseInt(cleanId, 10), { username });
    if (variant) {
      cleanId = variant.streamId;
      transcodeHint = transcodeHint || variant.profileId || null;
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

  if (hlsSegmentIndex != null) {
    const profiles = await getTranscodingProfiles();
    const hintedProfile = matchTranscodingProfile(transcodeHint, profiles);
    const explicitEco = isEcoProfileHint(transcodeHint);
    const hlsDiskStreamId = packagerDiskStreamId(cleanId, explicitEco ? ECO_DISK_PROFILE : hintedProfile);
    let segBuf = readPackagerHlsSegmentBuffer(hlsDiskStreamId, cleanId, hlsSegmentIndex);
    if (!segBuf?.length) {
      const cachedUpstream = await cacheGet<string>(hlsRelayCacheKey(line.id, cleanId));
      if (cachedUpstream) {
        await ensureDiskHls({
          upstreamUrl: cachedUpstream,
          streamId: hlsDiskStreamId,
          userAgent: UPSTREAM_HLS_UA,
        });
        segBuf = readPackagerHlsSegmentBuffer(hlsDiskStreamId, cleanId, hlsSegmentIndex);
      }
    }
    if (segBuf?.length) {
      return servePackagerHlsSegmentResponse(segBuf, antiFreeze);
    }
    return withIptvCors(iptvText("Segment not found", { status: 404 }));
  }

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
  if (wantsM3u8) {
    candidates = expandHlsPlaybackCandidates(candidates);
  }

  const hlsHeaders = (body: string) =>
    withIptvCors(
      new NextResponse(body, {
        status: 200,
        headers: {
          ...buildLiveRedirectHeaders(antiFreeze),
          "Content-Type": normalizeHlsManifestContentType(HLS_PLAYLIST_CONTENT_TYPE),
          "Cache-Control": "no-cache, no-store",
        },
      })
    );

  const profiles = await getTranscodingProfiles();
  const hintedProfile = matchTranscodingProfile(transcodeHint, profiles);
  const explicitEco = isEcoProfileHint(transcodeHint);
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
  const mpegtsProfile = explicitEco ? ecoLiveProfile(bw) : hintedProfile ?? modeTranscode;
  const hlsDiskStreamId = packagerDiskStreamId(cleanId, explicitEco ? ECO_DISK_PROFILE : hintedProfile);
  const diskStreamId = packagerDiskStreamId(cleanId, explicitEco ? ECO_DISK_PROFILE : hintedProfile);
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
  const panelOrigin = serverBaseUrl(req.url, req.headers);

  let lastError = "Stream fetch failed";

  if (wantsM3u8) {
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
      const resolved = bw.instantStart
        ? playbackUrl
        : await resolvePlayableUpstreamUrl(playbackUrl, {
            userAgent: UPSTREAM_HLS_UA,
            timeoutMs: 8_000,
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
          rewritePackagerPlaylist(
            freshPackagerPlaylistBody(hlsDiskStreamId, packed.playlist),
            panelOrigin,
            username,
            password,
            requestStreamKey,
            hlsDiskStreamId
          )
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
    await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);

    const useHlsRemux = isHlsPlaybackUrl(playbackUrl);
    const transcodeOpts = profileOpts(mpegtsProfile);
    const preferDirect =
      mode === "direct" && !useHlsRemux && !transcodeOpts && !explicitEco && !hintedProfile;

    const returnTrackedMpegTs = (
      body: ReadableStream<Uint8Array> | Readable,
      contentType: string
    ): NextResponse =>
      withIptvCors(
        new NextResponse(body as unknown as BodyInit, {
          status: 200,
          headers: {
            ...buildLiveRedirectHeaders(antiFreeze),
            "Content-Type":
              contentType.includes("mpegurl") || contentType.includes("m3u8")
                ? normalizeHlsManifestContentType(contentType)
                : normalizeLiveMpegTsContentType(contentType),
            "Cache-Control": "no-cache, no-store",
            Connection: "keep-alive",
          },
        })
      );

    if (preferDirect) {
      const proxied = await proxyUpstreamNative(playbackUrl, UPSTREAM_HLS_UA, {
        panelOrigin,
        username,
        password,
        streamKey: requestStreamKey,
        saverEnabled: bw.saverEnabled,
      });
      if (proxied.ok) {
        if (await isSessionKicked(line.id, ip)) {
          return withIptvCors(iptvText("Session kicked", { status: 403 }));
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
                ...buildLiveRedirectHeaders(antiFreeze),
                ...Object.fromEntries(response.headers.entries()),
                "Content-Type": normalizeLiveMpegTsContentType(
                  response.headers.get("content-type") ?? "video/mp2t"
                ),
              },
            })
          );
        }
        return withIptvCors(response);
      }
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

    const forceUniversal = bw.forceUniversalMpegTs && useHlsRemux;
    const daemonTranscode = transcodeOpts;
    let daemonMpegts = await openDaemonMpegTs({
      streamId: diskStreamId,
      upstreamUrl: playbackUrl,
      lineId: line.id,
      clientIp: ip,
      userAgent: UPSTREAM_HLS_UA,
      hls: useHlsRemux,
      forceUniversal,
      transcode: daemonTranscode,
      signal: req.signal,
    });
    if (!daemonMpegts?.ok && daemonTranscode) {
      daemonMpegts = await openDaemonMpegTs({
        streamId: diskStreamId,
        upstreamUrl: playbackUrl,
        lineId: line.id,
        clientIp: ip,
        userAgent: UPSTREAM_HLS_UA,
        hls: useHlsRemux,
        forceUniversal,
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
      return returnTrackedMpegTs(tracked, daemonMpegts.contentType);
    }
    if (await isHlsDaemonHealthy()) {
      lastError = daemonMpegts?.error || "MPEGTS daemon failed";
      continue;
    }

    if (useHlsRemux) {
      const remux = await createHlsToMpegTsStream({
        hlsUrl: playbackUrl,
        lineId: line.id,
        streamId: diskStreamId,
        clientIp: ip,
        userAgent: UPSTREAM_HLS_UA,
        forceUniversal,
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
      return returnTrackedMpegTs(remuxBody, remux.contentType);
    }

    const proxied = await proxyUpstreamNative(playbackUrl, UPSTREAM_HLS_UA, {
      panelOrigin,
      username,
      password,
      streamKey: requestStreamKey,
      saverEnabled: bw.saverEnabled,
    });
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
            "Content-Type": normalizeLiveMpegTsContentType(
              response.headers.get("content-type") ?? "video/mp2t"
            ),
          },
        })
      );
    }

    return withIptvCors(response);
  }

  const status = /timeout/i.test(lastError) ? 504 : 502;
  return withIptvCors(iptvText(lastError.slice(0, 200) || "Stream fetch failed", { status }));
}
