import { NextRequest, NextResponse } from "next/server";
import { isSessionKicked, attachKickAwareProxyBody } from "@/lib/connections";
import { getClientIp } from "@/lib/client-ip";

import { buildLiveRedirectHeaders, getAntiFreezeSettings } from "@/lib/anti-freeze";
import { authorizeHlsLiveRequest, decodeRelayTarget } from "@/lib/hls-live-auth";
import {
  buildHlsRelayUrl,
  fetchHlsUpstream,
  rewriteHlsManifestForRelay,
  HLS_PLAYLIST_CONTENT_TYPE,
  UPSTREAM_HLS_UA,
} from "@/lib/hls-playback";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { logActivity } from "@/lib/lines";

export const runtime = "nodejs";

export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const { username, password, streamId } = await ctx.params;
  const auth = await authorizeHlsLiveRequest(req, username, password, streamId);
  if (!auth.ok) {
    const msg = auth.message === "kicked" ? "Session kicked" : auth.message;
    return iptvText(msg, { status: auth.status });
  }

  const clientIp = getClientIp(req);
  const target = decodeRelayTarget(req.nextUrl.searchParams.get("u"), auth.rootUpstream);
  if (!target) return iptvText("Bad relay target", { status: 400 });

  const antiFreeze = await getAntiFreezeSettings();
  const range = req.headers.get("range");
  const upstream = await fetchHlsUpstream(target, UPSTREAM_HLS_UA, range);

  if (!upstream.ok) {
    void logActivity("stream_hls_relay_error", {
      lineId: auth.lineId,
      entity: "stream",
      entityId: auth.streamId,
      meta: { target, status: upstream.status, detail: upstream.detail },
    });
    return iptvText("Segment unavailable", { status: upstream.status >= 400 ? upstream.status : 502 });
  }

  const panelOrigin = req.nextUrl.origin;
  const relay = (url: string) =>
    buildHlsRelayUrl(
      panelOrigin,
      auth.username,
      auth.password,
      auth.requestStreamKey,
      url
    );

  if (upstream.kind === "manifest") {
    if (await isSessionKicked(auth.lineId, clientIp)) {
      return iptvText("Session kicked", { status: 403 });
    }

    const body = rewriteHlsManifestForRelay(upstream.body, upstream.finalUrl, relay);
    return withIptvCors(
      new NextResponse(body, {
        status: 200,
        headers: {
          ...buildLiveRedirectHeaders(antiFreeze),
          "Content-Type": HLS_PLAYLIST_CONTENT_TYPE,
          "Cache-Control": "no-cache, no-store",
        },
      })
    );
  }

  if (await isSessionKicked(auth.lineId, clientIp)) {
    return iptvText("Session kicked", { status: 403 });
  }

  const rawBody = upstream.body;
  const kickedBody =
    rawBody && typeof (rawBody as { getReader?: unknown }).getReader === "function"
      ? attachKickAwareProxyBody({
          body: rawBody as unknown as ReadableStream<Uint8Array>,
          lineId: auth.lineId,
          streamId: auth.streamId,
          ip: clientIp || "",
          userAgent: auth.userAgent,
        })
      : rawBody;

  return withIptvCors(
    new NextResponse(kickedBody as unknown as BodyInit, {
      status: range ? 206 : 200,
      headers: {
        ...buildLiveRedirectHeaders(antiFreeze),
        "Content-Type": upstream.contentType,
        "Cache-Control": "no-cache, no-store",
        "Accept-Ranges": "bytes",
      },
    })
  );
}
