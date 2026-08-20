import { NextRequest, NextResponse } from "next/server";
import { isSessionKicked } from "@/lib/connections";
import { getClientIp } from "@/lib/client-ip";

import { buildLiveRedirectHeaders, getAntiFreezeSettings } from "@/lib/anti-freeze";
import { authorizeHlsLiveRequest, decodeRelayTarget } from "@/lib/hls-live-auth";
import { HLS_PLAYLIST_CONTENT_TYPE } from "@/lib/hls-playback";
import { fetchHlsUpstream, UPSTREAM_HLS_UA } from "@/lib/hls-playback";
import { antiFreezeLiveHeaders, respondNativeHlsRelay } from "@/lib/hls-relay-response";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { logActivity } from "@/lib/lines";

export const runtime = "nodejs";

export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const { username, password, streamId } = await ctx.params;
  const auth = await authorizeHlsLiveRequest(req, username, password, streamId);
  if (!auth.ok) {
    const msg = auth.message === "kicked" ? "Session kicked" : auth.message;
    return iptvText(msg, { status: auth.status });
  }
  const antiFreeze = await getAntiFreezeSettings();
  return withIptvCors(
    new NextResponse(null, {
      status: 200,
      headers: {
        ...buildLiveRedirectHeaders(antiFreeze),
        "Content-Type": HLS_PLAYLIST_CONTENT_TYPE,
        "Cache-Control": "no-cache, no-store",
        "Accept-Ranges": "none",
      },
    })
  );
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
  const upstream = await fetchHlsUpstream(target, UPSTREAM_HLS_UA, null);

  if (!upstream.ok) {
    void logActivity("stream_hls_relay_error", {
      lineId: auth.lineId,
      entity: "stream",
      entityId: auth.streamId,
      meta: { target, status: upstream.status, detail: upstream.detail },
    });
    return iptvText("Segment unavailable", { status: upstream.status >= 400 ? upstream.status : 502 });
  }

  if (await isSessionKicked(auth.lineId, clientIp)) {
    return iptvText("Session kicked", { status: 403 });
  }

  return respondNativeHlsRelay(upstream, req, auth, antiFreezeLiveHeaders(antiFreeze));
}
