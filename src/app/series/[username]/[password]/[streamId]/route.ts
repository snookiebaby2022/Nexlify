import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

import { asPlaybackGuardLine, assertPlaybackAllowed, playbackDenyMessage } from "@/lib/playback-guard";
import { isSessionKicked, attachKickAwareProxyBody } from "@/lib/connections";
import { getLineForPlaybackAuth, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { resolveStreamIdParam } from "@/lib/xtream-stream-id";
import { openUpstreamLiveStream, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { isHlsClientPath, HLS_PLAYLIST_CONTENT_TYPE, buildClientVodHlsPlaylist, UPSTREAM_HLS_UA, isHlsPlaybackUrl } from "@/lib/hls-playback";
import { vodHlsFileRedirectLocation } from "@/lib/vod-proxy";
import { serverBaseUrl } from "@/lib/xtream";

export const runtime = "nodejs";
const PROXY_TIMEOUT_MS = 60_000;

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
  const ip = getClientIp(req);

  const cleanId = (await resolveStreamIdParam(streamId, { username })) ?? streamId.replace(/\.(ts|m3u8|mp4|mkv|avi|mov|webm)$/i, "");

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return iptvText("Unauthorized", { status: 401 });
  }

  const ua = req.headers.get("user-agent") ?? undefined;
  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua, {
    streamId: cleanId,
  });
  if (deny) {
    const status = deny === "ddos" || deny === "rate" ? 429 : 403;
    return iptvText(playbackDenyMessage(deny), { status });
  }

  const playbackUrl = await resolvePlaybackUrlForLine(line.id, cleanId, {
    clientIp: ip,
    userAgent: ua,
    skipGeo: true,
  });
  if (!playbackUrl) return iptvText("Not found", { status: 404 });

  if (isHlsClientPath(streamId) || /\.m3u8$/i.test(streamId)) {
    const streamKey = streamId.replace(/\.(m3u8|hls)$/i, "");
    if (isHlsPlaybackUrl(playbackUrl)) {
      const packed = await buildClientVodHlsPlaylist({
        playbackUrl,
        panelOrigin: serverBaseUrl(req.url, req.headers),
        username,
        password,
        streamKey,
        diskStreamId: cleanId,
      });
      if (packed.ok) {
        return withIptvCors(
          new NextResponse(packed.body, {
            status: 200,
            headers: { "Content-Type": HLS_PLAYLIST_CONTENT_TYPE, "Cache-Control": "no-cache" },
          })
        );
      }
    }
    const fileLoc = vodHlsFileRedirectLocation(streamId, playbackUrl);
    if (fileLoc) {
      return withIptvCors(
        new NextResponse(null, {
          status: 302,
          headers: { Location: fileLoc, "Cache-Control": "no-cache" },
        })
      );
    }
  }

  const range = req.headers.get("range");
  let open;
  try {
    open = await openUpstreamLiveStream(playbackUrl, {
      userAgent: UPSTREAM_HLS_UA,
      timeoutMs: PROXY_TIMEOUT_MS,
      headers: range ? { Range: range } : undefined,
      forwardRange: Boolean(range),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Playback fetch failed";
    const status = /timeout/i.test(msg) ? 504 : 502;
    return iptvText(msg.slice(0, 200), { status });
  }

  if (await isSessionKicked(line.id, ip)) {
    return withIptvCors(iptvText("Session kicked", { status: 403 }));
  }

  const { stream, headers } = upstreamToWebResponse(
    open,
    range ? { "Accept-Ranges": "bytes" } : undefined,
    { vod: true, playbackUrl }
  );
  const trackedBody = attachKickAwareProxyBody({
    body: stream as unknown as ReadableStream<Uint8Array>,
    lineId: line.id,
    streamId: cleanId,
    ip: ip ?? "",
    userAgent: ua,
  });

  return withIptvCors(
    new NextResponse(trackedBody as unknown as BodyInit, {
      status: open.status === 206 ? 206 : 200,
      headers,
    })
  );
}
