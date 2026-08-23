import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "zlib";
import { getLineByCredentials, lineIsPlayable } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { buildLineXmltv } from "@/lib/xmltv-export";
import { shouldGzipXmltv, xmltvWantsGzipFile } from "@/lib/xmltv-http";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { withIptvCors } from "@/lib/iptv-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY_XMLTV = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Nexlify">\n</tv>`;

export async function GET(req: NextRequest) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const username = req.nextUrl.searchParams.get("username");
  const password = req.nextUrl.searchParams.get("password");

  if (!username || !password) {
    return new NextResponse("Missing credentials", { status: 400 });
  }

  const line = await getLineByCredentials(username, password);
  if (!line || !lineIsPlayable(line)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const deny = await assertPlaybackAllowed(
    asPlaybackGuardLine(line),
    getClientIp(req),
    req.headers.get("user-agent") ?? undefined,
    { listingOnly: true }
  );
  if (deny) return new NextResponse("Forbidden", { status: deny === "rate" ? 429 : 403 });

  let xml = EMPTY_XMLTV;
  try {
    xml = await buildLineXmltv(line);
  } catch (e) {
    console.error("[xmltv] build failed:", e instanceof Error ? e.message : e);
  }
  const typeParam = req.nextUrl.searchParams.get("type");
  const gzipFile = xmltvWantsGzipFile(typeParam);
  const headers = new Headers({
    "Content-Type": gzipFile ? "application/gzip" : "text/xml; charset=utf-8",
    "Cache-Control": "private, max-age=180, no-transform",
    Vary: "Accept-Encoding",
  });
  const acceptEnc = (req.headers.get("accept-encoding") ?? "").toLowerCase();
  const ua = req.headers.get("user-agent") ?? "";
  if (shouldGzipXmltv(acceptEnc, ua, typeParam) && xml.length >= 512) {
    const compressed = gzipSync(Buffer.from(xml, "utf8"), { level: 6 });
    if (!gzipFile) headers.set("Content-Encoding", "gzip");
    headers.set("Content-Length", String(compressed.length));
    return withIptvCors(new NextResponse(compressed, { headers }));
  }
  headers.set("Content-Length", String(Buffer.byteLength(xml)));
  return withIptvCors(new NextResponse(xml, { headers }));
}
