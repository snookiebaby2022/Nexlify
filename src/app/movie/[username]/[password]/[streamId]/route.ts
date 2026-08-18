import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { isSessionKicked, attachKickAwareProxyBody } from "@/lib/connections";
import { getLineForPlaybackAuth, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { openUpstreamLiveStream, upstreamToWebResponse } from "@/lib/live-upstream-proxy";
import { isHlsClientPath, HLS_PLAYLIST_CONTENT_TYPE, buildClientVodHlsPlaylist, buildVodProgressiveHlsManifest, UPSTREAM_HLS_UA } from "@/lib/hls-playback";
import { serverBaseUrl } from "@/lib/xtream";

export const runtime = "nodejs";
const PROXY_TIMEOUT_MS = 30_000;

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
  let cleanId = streamId.replace(/\.(ts|m3u8|mp4|mkv|avi|mov|webm)$/i, "");
  const ip = getClientIp(req);

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
  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua, {
    streamId: cleanId,
  });
  if (deny === "ip") return iptvText("IP not allowed for this line", { status: 403 });
  if (deny === "connections") return iptvText("Max connections reached. You are using all allowed streams. Please disconnect another device or increase your connection limit in the panel.", { status: 403 });
  if (deny === "rate") return iptvText("Rate limit exceeded", { status: 429 });
  if (deny === "blocklist") return iptvText("Access blocked", { status: 403 });
  if (deny === "country") return iptvText("Country not allowed", { status: 403 });
  if (deny === "vpn") return iptvText("VPN or hosting not allowed", { status: 403 });
  if (deny === "user_agent") return iptvText("User-Agent not allowed for this line", { status: 403 });
  if (deny === "kicked") return iptvText("Session kicked", { status: 403 });

  const playbackUrl = await resolvePlaybackUrlForLine(line.id, cleanId, { clientIp: ip, userAgent: ua });
  if (!playbackUrl) return iptvText("Not found", { status: 404 });

  if (isHlsClientPath(streamId) || /\.m3u8$/i.test(streamId)) {
    const streamKey = streamId.replace(/\.(m3u8|hls)$/i, "");
    const packed = await buildClientVodHlsPlaylist({
      playbackUrl,
      panelOrigin: serverBaseUrl(req.url, req.headers),
      username,
      password,
      streamKey,
      diskStreamId: cleanId,
    });
    const body = packed.ok
      ? packed.body
      : buildVodProgressiveHlsManifest("movie", username, password, streamKey);
    return withIptvCors(
      new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": HLS_PLAYLIST_CONTENT_TYPE, "Cache-Control": "no-cache" },
      })
    );
  }

  const range = req.headers.get("range");
  let open;
  try {
    open = await openUpstreamLiveStream(playbackUrl, {
      userAgent: UPSTREAM_HLS_UA,
      timeoutMs: PROXY_TIMEOUT_MS,
      headers: range ? { Range: range } : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Playback fetch failed";
    const status = /timeout/i.test(msg) ? 504 : 502;
    return iptvText(msg.slice(0, 200), { status });
  }

  if (await isSessionKicked(line.id, ip)) {
    return withIptvCors(iptvText("Session kicked", { status: 403 }));
  }

  const { stream, headers } = upstreamToWebResponse(open, range ? { "Accept-Ranges": "bytes" } : undefined);
  const trackedBody = attachKickAwareProxyBody({
    body: stream as unknown as ReadableStream<Uint8Array>,
    lineId: line.id,
    streamId: cleanId,
    ip: ip ?? "",
    userAgent: ua,
  });
  return withIptvCors(
    new NextResponse(trackedBody as unknown as BodyInit, {
      status: range ? 206 : 200,
      headers,
    })
  );
}
