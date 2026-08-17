import { NextRequest, NextResponse } from "next/server";
import { isSessionKicked, attachKickAwareProxyBody } from "@/lib/connections";
import { getClientIp } from "@/lib/client-ip";

if (typeof process !== "undefined") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
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
import { ensureDiskHls } from "@/lib/hls-restream-client";
import { isPackagerSegmentName, readTsHlsSegment } from "@/lib/ts-hls-packager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return iptvCorsPreflight();
}

function bufferToStream(buf: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
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
    let buf = readTsHlsSegment(auth.lineId, auth.streamId, token);
    if (!buf?.length) {
      const packed = await ensureDiskHls({
        upstreamUrl: auth.rootUpstream,
        streamId: auth.streamId,
        userAgent: auth.userAgent,
      });
      if (!packed.ok) {
        return iptvText("Segment unavailable", { status: 502 });
      }
      buf = readTsHlsSegment(auth.lineId, auth.streamId, token);
    }
    if (!buf?.length) return iptvText("Segment not found", { status: 404 });
    if (await isSessionKicked(auth.lineId, clientIp)) {
      return iptvText("Session kicked", { status: 403 });
    }
    const body = attachKickAwareProxyBody({
      body: bufferToStream(buf),
      lineId: auth.lineId,
      streamId: auth.streamId,
      ip: clientIp || "",
      userAgent: auth.userAgent,
    });
    return withIptvCors(
      new NextResponse(body as unknown as BodyInit, {
        status: 200,
        headers: {
          ...buildLiveRedirectHeaders(antiFreeze),
          "Content-Type": "video/mp2t",
          "Content-Length": String(buf.length),
          "Cache-Control": "no-cache, no-store",
        },
      })
    );
  }

  const target = decodeRelayTarget(token, auth.rootUpstream);
  if (!target) return iptvText("Bad relay target", { status: 400 });

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

  const segmentBuf = Buffer.from(upstream.body);
  const kickedBody = attachKickAwareProxyBody({
    body: bufferToStream(segmentBuf),
    lineId: auth.lineId,
    streamId: auth.streamId,
    ip: clientIp || "",
    userAgent: auth.userAgent,
  });

  return withIptvCors(
    new NextResponse(kickedBody as unknown as BodyInit, {
      status: range ? 206 : 200,
      headers: {
        ...buildLiveRedirectHeaders(antiFreeze),
        "Content-Type": upstream.contentType,
        "Cache-Control": "no-cache, no-store",
        "Content-Length": String(segmentBuf.length),
        ...(range ? { "Accept-Ranges": "bytes" } : {}),
      },
    })
  );
}
