import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "zlib";
import { getLineByCredentials, lineIsPlayable } from "@/lib/lines";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { buildLineXmltv } from "@/lib/xmltv-export";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { withIptvCors } from "@/lib/iptv-cors";

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

  const xml = await buildLineXmltv(line);
  const headers = new Headers({
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "private, max-age=300",
  });
  const accept = req.headers.get("accept-encoding") ?? "";
  if (xml.length >= 2048 && /\bgzip\b/i.test(accept)) {
    const compressed = gzipSync(Buffer.from(xml, "utf8"), { level: 6 });
    headers.set("Content-Encoding", "gzip");
    headers.set("Content-Length", String(compressed.length));
    headers.set("Vary", "Accept-Encoding");
    return withIptvCors(new NextResponse(compressed, { headers }));
  }
  return withIptvCors(new NextResponse(xml, { headers }));
}
