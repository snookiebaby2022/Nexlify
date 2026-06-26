import { NextRequest, NextResponse } from "next/server";
import { getLineByCredentials, lineIsPlayable } from "@/lib/lines";
import { buildM3u, serverBaseUrl } from "@/lib/xtream";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  const password = req.nextUrl.searchParams.get("password");
  const type = req.nextUrl.searchParams.get("type") ?? "m3u_plus";

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
    req.headers.get("user-agent") ?? undefined
  );
  if (deny) return new NextResponse("Forbidden", { status: deny === "rate" ? 429 : 403 });

  const baseUrl = serverBaseUrl(req.url, req.headers);
  const body = await buildM3u(line, baseUrl, type);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/x-mpegURL",
      "Content-Disposition": `attachment; filename="${username}.m3u"`,
    },
  });
}
