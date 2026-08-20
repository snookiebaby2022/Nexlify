import { NextRequest, NextResponse } from "next/server";
import { isSessionKicked } from "@/lib/connections";
import { getClientIp } from "@/lib/client-ip";

import { buildLiveRedirectHeaders, getAntiFreezeSettings } from "@/lib/anti-freeze";
import { authorizeHlsLiveRequest, decodeRelayTarget } from "@/lib/hls-live-auth";
import {
  fetchHlsUpstream,
  HLS_PLAYLIST_CONTENT_TYPE,
  hlsMediaSegmentHttp,
  UPSTREAM_HLS_UA,
} from "@/lib/hls-playback";
import { antiFreezeLiveHeaders, respondNativeHlsRelay } from "@/lib/hls-relay-response";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { logActivity } from "@/lib/lines";
import { ensureDiskHls } from "@/lib/hls-restream-client";
import { isPackagerSegmentName, readTsHlsSegment } from "@/lib/ts-hls-packager";
import { resolveOutboundProxyForStream } from "@/lib/outbound-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string; token: string }> }
) {
  const { username, password, streamId, token: rawToken } = await ctx.params;
  const auth = await authorizeHlsLiveRequest(req, username, password, streamId);
  if (!auth.ok) {
    const msg = auth.message === "kicked" ? "Session kicked" : auth.message;
    return iptvText(msg, { status: auth.status });
  }
  const antiFreeze = await getAntiFreezeSettings();
  const token = decodeURIComponent(rawToken).split("/").pop() ?? rawToken;
  const isSeg = isPackagerSegmentName(token);
  const headers = isSeg
    ? hlsMediaSegmentHttp(0).headers
    : {
        "Content-Type": HLS_PLAYLIST_CONTENT_TYPE,
        "Cache-Control": "no-cache, no-store",
        "Accept-Ranges": "none",
      };
  if (isSeg) delete headers["Content-Length"];
  return withIptvCors(
    new NextResponse(null, {
      status: 200,
      headers: { ...buildLiveRedirectHeaders(antiFreeze), ...headers },
    })
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string; token: string }> }
) {
  const { username, password, streamId, token: rawToken } = await ctx.params;
  const token = decodeURIComponent(rawToken).split("/").pop() ?? rawToken;
  const auth = await authorizeHlsLiveRequest(req, username, password, streamId);
  if (!auth.ok) {
    const msg = auth.message === "kicked" ? "Session kicked" : auth.message;
    return iptvText(msg, { status: auth.status });
  }

  const clientIp = getClientIp(req);
  const antiFreeze = await getAntiFreezeSettings();

  if (isPackagerSegmentName(token)) {
    let buf = readTsHlsSegment(auth.lineId, auth.diskStreamId, token);
    if (!buf?.length && auth.diskStreamId !== auth.streamId) {
      buf = readTsHlsSegment(auth.lineId, auth.streamId, token);
    }
    if (!buf?.length) {
      const packed = await ensureDiskHls({
        upstreamUrl: auth.rootUpstream,
        streamId: auth.diskStreamId,
        userAgent: auth.userAgent,
      });
      if (!packed.ok) {
        return iptvText("Segment unavailable", { status: 502 });
      }
      buf = readTsHlsSegment(auth.lineId, auth.diskStreamId, token);
    }
    if (!buf?.length) return iptvText("Segment not found", { status: 404 });
    if (await isSessionKicked(auth.lineId, clientIp)) {
      return iptvText("Session kicked", { status: 403 });
    }
    const seg = hlsMediaSegmentHttp(buf.length);
    return withIptvCors(
      new NextResponse(buf, {
        status: seg.status,
        headers: {
          ...buildLiveRedirectHeaders(antiFreeze),
          ...seg.headers,
        },
      })
    );
  }

  const target = decodeRelayTarget(token, auth.rootUpstream);
  if (!target) return iptvText("Bad relay target", { status: 400 });

  const outboundProxy = await resolveOutboundProxyForStream(auth.streamId);
  const upstream = await fetchHlsUpstream(target, UPSTREAM_HLS_UA, null, 20_000, outboundProxy);

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
