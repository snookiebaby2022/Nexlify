import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { trackConnection } from "@/lib/connections";
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
  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua, {
    streamId: cleanId,
  });
  if (deny === "ip") return iptvText("IP not allowed for this line", { status: 403 });
  if (deny === "connections") return iptvText("Max connections reached", { status: 403 });
  if (deny === "rate") return iptvText("Rate limit exceeded", { status: 429 });
  if (deny === "blocklist") return iptvText("Access blocked", { status: 403 });
  if (deny === "country") return iptvText("Country not allowed", { status: 403 });
  if (deny === "vpn") return iptvText("VPN or hosting not allowed", { status: 403 });
  if (deny === "user_agent") return iptvText("User-Agent not allowed for this line", { status: 403 });
  if (deny === "ddos") return iptvText("Access temporarily blocked (DDoS shield)", { status: 429 });

  const antiFreeze = await getAntiFreezeSettings();
  const playbackUrl = await resolvePlaybackUrlForLine(
    line.id,
    cleanId,
    { clientIp: ip, userAgent: ua },
    antiFreeze.playbackUrlCacheTtlSec
  );
  if (!playbackUrl) return iptvText("Not found", { status: 404 });

  scheduleZapPrefetch(line.id, cleanId, { clientIp: ip, userAgent: ua }, antiFreeze);

  void trackConnection({
    lineId: line.id,
    streamId: cleanId,
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  // HLS upstream: IPTV apps request …/id.ts and need MPEG-TS; browsers/web players can use …/id.m3u8.
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
      return withIptvCors(
        new NextResponse(remux.stream as BodyInit, {
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

  return withIptvCors(
    NextResponse.redirect(playbackUrl, {
      status: 302,
      headers: buildLiveRedirectHeaders(antiFreeze),
    })
  );
}
