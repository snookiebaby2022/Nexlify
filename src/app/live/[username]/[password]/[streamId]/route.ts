import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed, playbackDenyMessage } from "@/lib/playback-guard";
import { trackConnection, removeConnection } from "@/lib/connections";
import {
  buildLiveRedirectHeaders,
  getAntiFreezeSettings,
  scheduleZapPrefetch,
} from "@/lib/anti-freeze";
import { getLineForPlaybackAuth, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { fetchHlsManifestForClient, isHlsPlaybackUrl, buildHlsRelayUrl, rewriteHlsManifestForRelay, hlsRelayCacheKey } from "@/lib/hls-playback";
import { createHlsToMpegTsStream } from "@/lib/hls-mpegts-relay";
import { cacheSet } from "@/lib/cache";
import { logActivity } from "@/lib/lines";

export const runtime = "nodejs";

const PROXY_TIMEOUT_MS = 30_000;

async function proxyUpstream(
  url: string,
  ua: string | undefined,
  opts?: { wantM3u8?: boolean }
): Promise<NextResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      headers: {
        ...(ua ? { "User-Agent": ua } : {}),
        Accept: "*/*",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return iptvText("Stream unavailable", {
        status: upstream.status === 404 ? 404 : 502,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

    // If upstream returned an HLS manifest, rewrite segment URLs to relay through the panel
    if (opts?.wantM3u8 && (contentType.includes("mpegurl") || contentType.includes("m3u8"))) {
      const body = await upstream.text();
      // Rewrite relative/absolute segment URLs to go through the panel relay
      const rewritten = body.replace(
        /^(?!#)(.+\.ts.*)$/gm,
        (match) => {
          if (match.startsWith("http")) return match;
          return match; // Will be handled by rewriteHlsManifestForRelay if needed
        }
      );
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Stream the response body directly to the client
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": "*",
      Connection: "keep-alive",
    };

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers["Content-Length"] = contentLength;

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return iptvText("Stream timeout", { status: 504 });
    }
    return iptvText("Stream fetch failed", { status: 502 });
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
  const cleanId = streamId.replace(/\.(ts|m3u8)$/, "");
  const ip = getClientIp(req);

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return iptvText("Unauthorized", { status: 401 });
  }

  const ua = req.headers.get("user-agent") ?? undefined;

  const antiFreeze = await getAntiFreezeSettings();
  const playbackUrl = await resolvePlaybackUrlForLine(
    line.id,
    cleanId,
    { clientIp: ip, userAgent: ua },
    antiFreeze.playbackUrlCacheTtlSec
  );
  if (!playbackUrl) return iptvText("Not found", { status: 404 });

  scheduleZapPrefetch(line.id, cleanId, { clientIp: ip, userAgent: ua }, antiFreeze);

  // HLS upstream: proxy manifest and rewrite segment URLs to relay through the panel
  if (isHlsPlaybackUrl(playbackUrl)) {
    await cacheSet(hlsRelayCacheKey(line.id, cleanId), playbackUrl, 3600);
    const wantsM3u8 = /\.m3u8$/i.test(streamId);

    if (!wantsM3u8) {
      const remux = await createHlsToMpegTsStream({
        hlsUrl: playbackUrl,
        lineId: line.id,
        streamId: cleanId,
        clientIp: ip,
        userAgent: ua,
      });
      if ("error" in remux) {
        void logActivity("stream_hls_relay_error", {
          lineId: line.id,
          entity: "stream",
          entityId: cleanId,
          meta: { mode: "mpegts_remux", error: remux.error },
        });
        return iptvText(remux.error, { status: 502 });
      }
      void trackConnection({ lineId: line.id, streamId: cleanId, ip, userAgent: ua });
      const remuxBody = new ReadableStream({
        start(controller) {
          const reader = (remux.stream as ReadableStream).getReader();
          const pump = () => {
            reader.read().then(({ done, value }) => {
              if (done) {
                controller.close();
                void removeConnection(line.id, cleanId, ip);
                return;
              }
              controller.enqueue(value);
              pump();
            }).catch(() => {
              controller.close();
              void removeConnection(line.id, cleanId, ip);
            });
          };
          pump();
        },
        cancel() {
          void removeConnection(line.id, cleanId, ip);
        },
      });
      return withIptvCors(
        new NextResponse(remuxBody, {
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

    const manifest = await fetchHlsManifestForClient(playbackUrl, ua);
    if (!manifest.ok) return iptvText("Stream unavailable", { status: manifest.status === 404 ? 404 : 502 });

    const panelOrigin = req.nextUrl.origin;
    const relay = (url: string) =>
      buildHlsRelayUrl(panelOrigin, username, password, cleanId, url);
    const body = rewriteHlsManifestForRelay(manifest.body, manifest.finalUrl, relay);

    void trackConnection({ lineId: line.id, streamId: cleanId, ip, userAgent: ua });
    return withIptvCors(
      new NextResponse(body, {
        status: 200,
        headers: {
          ...buildLiveRedirectHeaders(antiFreeze),
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store",
        },
      })
    );
  }

  // Non-HLS upstream
  const wantsM3u8 = /\.m3u8$/i.test(streamId);

  if (wantsM3u8) {
    // Redirect .m3u8 to the upstream URL directly
    // This is how XUI One and 1-stream handle it — no proxy, no manifest generation
    void trackConnection({ lineId: line.id, streamId: cleanId, ip, userAgent: ua });
    return NextResponse.redirect(playbackUrl, 302);
  }

  // For .ts requests, also redirect to upstream
  // This avoids proxying through Next.js which causes compatibility issues
  void trackConnection({ lineId: line.id, streamId: cleanId, ip, userAgent: ua });
  return NextResponse.redirect(playbackUrl, 302);
}
