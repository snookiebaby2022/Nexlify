import { NextRequest, NextResponse } from "next/server";
import { getLineByCredentials, lineIsPlayable } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { buildLineXmltv, buildLineXmltvGzip } from "@/lib/xmltv-export";
import { shouldGzipXmltv, xmltvWantsGzipFile } from "@/lib/xmltv-http";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { withIptvCors } from "@/lib/iptv-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY_XMLTV = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Nexlify">\n</tv>`;

async function authorizeXmltv(req: NextRequest) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return { error: demoBlock };
  const username = req.nextUrl.searchParams.get("username");
  const password = req.nextUrl.searchParams.get("password");
  if (!username || !password) {
    return { error: new NextResponse("Missing credentials", { status: 400 }) };
  }
  const line = await getLineByCredentials(username, password);
  if (!line || !lineIsPlayable(line)) {
    return { error: new NextResponse("Unauthorized", { status: 401 }) };
  }
  const deny = await assertPlaybackAllowed(
    asPlaybackGuardLine(line),
    getClientIp(req),
    req.headers.get("user-agent") ?? undefined,
    { listingOnly: true }
  );
  if (deny) return { error: new NextResponse("Forbidden", { status: deny === "rate" ? 429 : 403 }) };
  return { line };
}

/** XCIPTV probes xmltv with HEAD during Update Content — do not build the full guide. */
export async function HEAD(req: NextRequest) {
  const auth = await authorizeXmltv(req);
  if (auth.error) return auth.error;
  return withIptvCors(
    new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    })
  );
}

export async function GET(req: NextRequest) {
  const auth = await authorizeXmltv(req);
  if (auth.error) return auth.error;
  const line = auth.line!;

  const typeParam = req.nextUrl.searchParams.get("type");
  const gzipFile = xmltvWantsGzipFile(typeParam);
  const acceptEnc = (req.headers.get("accept-encoding") ?? "").toLowerCase();
  const ua = req.headers.get("user-agent") ?? "";
  const headers = new Headers({
    "Content-Type": gzipFile ? "application/gzip" : "application/xml; charset=utf-8",
    "Cache-Control": "private, no-cache, no-store, must-revalidate",
    Vary: "Accept-Encoding",
  });
  try {
    if (shouldGzipXmltv(acceptEnc, ua, typeParam)) {
      const compressed = await buildLineXmltvGzip(line);
      if (compressed.length >= 32) {
        if (!gzipFile) headers.set("Content-Encoding", "gzip");
        headers.set("Content-Length", String(compressed.length));
        return withIptvCors(new NextResponse(compressed, { headers }));
      }
    }
    const xml = await buildLineXmltv(line);
    headers.set("Content-Length", String(Buffer.byteLength(xml)));
    return withIptvCors(new NextResponse(xml, { headers }));
  } catch (e) {
    console.error("[xmltv] build failed:", e instanceof Error ? e.message : e);
    headers.set("Content-Length", String(Buffer.byteLength(EMPTY_XMLTV)));
    return withIptvCors(new NextResponse(EMPTY_XMLTV, { headers }));
  }
}
