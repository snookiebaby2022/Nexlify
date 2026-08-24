import { NextRequest, NextResponse } from "next/server";
import { getLineByCredentials, lineIsPlayable, type LineWithBouquets } from "@/lib/lines";
import { buildM3uStream, serverBaseUrl } from "@/lib/xtream";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed, playbackDenyMessage } from "@/lib/playback-guard";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { iptvCorsPreflight, iptvText } from "@/lib/iptv-cors";
import { xtreamM3uFilename } from "@/lib/xtream-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const M3U_HEADERS = {
  "Content-Type": "audio/x-mpegurl",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return iptvCorsPreflight();
}

async function authorizeGetPhp(
  req: NextRequest
): Promise<{ error: NextResponse } | { error?: undefined; line: LineWithBouquets; username: string }> {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return { error: demoBlock };
  const username = req.nextUrl.searchParams.get("username");
  const password = req.nextUrl.searchParams.get("password");
  if (!username || !password) {
    return { error: iptvText("Missing credentials", { status: 400 }) };
  }
  const line = await getLineByCredentials(username, password);
  if (!line || !lineIsPlayable(line)) {
    return { error: iptvText("Unauthorized", { status: 401 }) };
  }
  const deny = await assertPlaybackAllowed(
    asPlaybackGuardLine(line),
    getClientIp(req),
    req.headers.get("user-agent") ?? undefined,
    { listingOnly: true }
  );
  if (deny) {
    return {
      error: iptvText(playbackDenyMessage(deny), { status: deny === "rate" || deny === "ddos" ? 429 : 403 }),
    };
  }
  return { line, username };
}

/** Some players HEAD get.php before downloading the playlist. */
export async function HEAD(req: NextRequest) {
  const auth = await authorizeGetPhp(req);
  if (auth.error) return auth.error;
  return iptvText(null, {
    status: 200,
    headers: {
      ...M3U_HEADERS,
      "Content-Disposition": `attachment; filename="${xtreamM3uFilename(auth.username)}"`,
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await authorizeGetPhp(req);
  if (auth.error) return auth.error;
  const { line, username } = auth;
  const type = req.nextUrl.searchParams.get("type") ?? "m3u_plus";
  const outputRaw = (req.nextUrl.searchParams.get("output") ?? "ts").toLowerCase();
  const output: "hls" | "ts" =
    outputRaw === "hls" || outputRaw === "m3u8" ? "hls" : "ts";
  const includeSeries =
    req.nextUrl.searchParams.get("include_series") === "1" ||
    req.nextUrl.searchParams.get("include_series") === "true";

  const baseUrl = serverBaseUrl(req.url, req.headers);
  const body = buildM3uStream(line, baseUrl, type, output, { includeSeries });

  return iptvText(body, {
    headers: {
      ...M3U_HEADERS,
      "Content-Disposition": `attachment; filename="${xtreamM3uFilename(username)}"`,
    },
  });
}
