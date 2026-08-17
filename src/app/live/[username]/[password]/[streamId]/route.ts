import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

// Allow upstream fetches to sources with expired/self-signed TLS certs (common for IPTV CDNs)
if (typeof process !== "undefined") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
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
import { ensureTsHlsPackager } from "@/lib/ts-hls-packager";

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
        },
      })
    );

  let lastError = "Stream fetch failed";
  let clientDirectHls: string | null = null;

  if (wantsM3u8) {
    const panelOrigin = serverBaseUrl(req.url, req.headers);
    for (let i = 0; i < candidates.length; i++) {
      const playbackUrl = candidates[i]!;
      if (!isHlsPlaybackUrl(playbackUrl)) continue;

      await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
      const probeTimeoutMs = originalCandidates.has(playbackUrl) ? 8_000 : 3_000;
      const manifest = await fetchHlsManifestForClient(playbackUrl, UPSTREAM_HLS_UA, probeTimeoutMs);
      if (!manifest.ok) {
        lastError = manifest.detail || "Stream unavailable";
        if (!clientDirectHls && shouldOfferClientDirectHls(manifest.status, manifest.detail)) {
          clientDirectHls = playbackUrl;
        }
        continue;
      }

      const relay = (url: string) =>
        buildHlsRelayUrl(panelOrigin, username, password, requestStreamKey, url);
      const body = rewriteHlsManifestForRelay(manifest.body, manifest.finalUrl, relay);
      if (antiFreeze.fastZapEnabled) {
        schedulePlaybackUpstreamWarm(playbackUrl, UPSTREAM_HLS_UA);
      }
      return hlsHeaders(body);
    }

    for (let i = 0; i < candidates.length; i++) {
      const playbackUrl = candidates[i]!;
      if (isHlsPlaybackUrl(playbackUrl)) continue;
      const resolved = await resolvePlayableUpstreamUrl(playbackUrl, {
        userAgent: UPSTREAM_HLS_UA,
        timeoutMs: 8_000,
      });
      if (!resolved) {
        lastError = "Upstream is not MPEG-TS";
        continue;
      }
      await cacheSet(hlsRelayCacheKey(line.id, cleanId), resolved, 3600);
      const packed = await ensureTsHlsPackager({
        upstreamUrl: resolved,
        lineId: line.id,
        streamId: cleanId,
        userAgent: UPSTREAM_HLS_UA,
      });
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
      const remux = await createHlsToMpegTsStream({
        hlsUrl: playbackUrl,
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
            ...buildLiveRedirectHeaders(antiFreeze),
            "Content-Type": remux.contentType,
            "Cache-Control": "no-cache, no-store",
            Connection: "keep-alive",
          },
        })
      );
    }

    const proxied = await proxyUpstreamNative(playbackUrl, ua);
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
