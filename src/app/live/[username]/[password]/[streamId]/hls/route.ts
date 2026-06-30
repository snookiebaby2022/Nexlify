import { NextRequest, NextResponse } from "next/server";
import { trackConnection } from "@/lib/connections";
import { buildLiveRedirectHeaders, getAntiFreezeSettings } from "@/lib/anti-freeze";
import { authorizeHlsLiveRequest, decodeRelayTarget } from "@/lib/hls-live-auth";
import {
  buildHlsRelayUrl,
  fetchHlsUpstream,
  rewriteHlsManifestForRelay,
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
  if (!auth.ok) return iptvText(auth.message, { status: auth.status });

  const target = decodeRelayTarget(req.nextUrl.searchParams.get("u"), auth.rootUpstream);
  if (!target) return iptvText("Bad relay target", { status: 400 });

  const antiFreeze = await getAntiFreezeSettings();
  const range = req.headers.get("range");
  const upstream = await fetchHlsUpstream(target, auth.userAgent, range);

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
    buildHlsRelayUrl(panelOrigin, auth.username, auth.password, auth.streamId, url);

  if (upstream.kind === "manifest") {
    void trackConnection({
      lineId: auth.lineId,
      streamId: auth.streamId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: auth.userAgent,
    });

    const body = rewriteHlsManifestForRelay(upstream.body, upstream.finalUrl, relay);
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
    new NextResponse(upstream.body, {
      status: range ? 206 : 200,
      headers: {
        ...buildLiveRedirectHeaders(antiFreeze),
        "Content-Type": upstream.contentType,
        "Cache-Control": "no-cache, no-store",
        ...(range ? { "Accept-Ranges": "bytes" } : {}),
      },
    })
  );
}
