import { NextResponse } from "next/server";
import { buildLiveRedirectHeaders } from "@/lib/anti-freeze";
import {
  buildHlsRelayUrl,
  fetchHlsUpstream,
  hlsMediaSegmentHttp,
  hlsSegmentStreamResponse,
  rewriteHlsManifestForRelay,
  HLS_PLAYLIST_CONTENT_TYPE,
  type HlsFetchResult,
  UPSTREAM_HLS_UA,
} from "@/lib/hls-playback";
import { withIptvCors } from "@/lib/iptv-cors";

type RelayAuth = {
  lineId: string;
  username: string;
  password: string;
  requestStreamKey: string;
};

export async function respondNativeHlsRelay(
  upstream: HlsFetchResult,
  req: { nextUrl: { origin: string } },
  auth: RelayAuth,
  antiFreezeHeaders: Record<string, string>
): Promise<NextResponse> {
  if (!upstream.ok) {
    return withIptvCors(
      new NextResponse("Segment unavailable", {
        status: upstream.status >= 400 ? upstream.status : 502,
      })
    );
  }

  const panelOrigin = req.nextUrl.origin;
  const relay = (url: string) =>
    buildHlsRelayUrl(panelOrigin, auth.username, auth.password, auth.requestStreamKey, url);

  if (upstream.kind === "manifest") {
    const body = rewriteHlsManifestForRelay(upstream.body, upstream.finalUrl, relay);
    return withIptvCors(
      new NextResponse(body, {
        status: 200,
        headers: {
          ...antiFreezeHeaders,
          "Content-Type": HLS_PLAYLIST_CONTENT_TYPE,
          "Cache-Control": "no-cache, no-store",
          "Accept-Ranges": "none",
        },
      })
    );
  }

  if (upstream.kind === "segment-stream") {
    const { stream, headers } = hlsSegmentStreamResponse(upstream.open);
    return withIptvCors(
      new NextResponse(stream as unknown as BodyInit, {
        status: 200,
        headers: { ...antiFreezeHeaders, ...headers },
      })
    );
  }

  const segmentBuf = Buffer.from(upstream.body);
  const seg = hlsMediaSegmentHttp(segmentBuf.length, upstream.contentType);
  return withIptvCors(
    new NextResponse(segmentBuf, {
      status: seg.status,
      headers: { ...antiFreezeHeaders, ...seg.headers },
    })
  );
}

export async function fetchAndRespondNativeHlsRelay(
  target: string,
  req: { nextUrl: { origin: string } },
  auth: RelayAuth,
  antiFreezeHeaders: Record<string, string>
): Promise<NextResponse> {
  const upstream = await fetchHlsUpstream(target, UPSTREAM_HLS_UA, null);
  return respondNativeHlsRelay(upstream, req, auth, antiFreezeHeaders);
}

export function antiFreezeLiveHeaders(antiFreeze: Awaited<ReturnType<typeof import("@/lib/anti-freeze").getAntiFreezeSettings>>) {
  return buildLiveRedirectHeaders(antiFreeze);
}
