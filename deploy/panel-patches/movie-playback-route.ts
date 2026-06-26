import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { trackConnection } from "@/lib/connections";
import { getLineForPlaybackAuth, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const { username, password, streamId } = await ctx.params;
  const cleanId = streamId.replace(/\.(ts|m3u8|mp4|mkv|avi|mov|webm)$/i, "");
  const ip = getClientIp(req);

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const ua = req.headers.get("user-agent") ?? undefined;
  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua);
  if (deny === "ip") return new NextResponse("IP not allowed for this line", { status: 403 });
  if (deny === "connections") return new NextResponse("Max connections reached", { status: 403 });
  if (deny === "rate") return new NextResponse("Rate limit exceeded", { status: 429 });
  if (deny === "blocklist") return new NextResponse("Access blocked", { status: 403 });
  if (deny === "country") return new NextResponse("Country not allowed", { status: 403 });
  if (deny === "vpn") return new NextResponse("VPN or hosting not allowed", { status: 403 });
  if (deny === "user_agent") return new NextResponse("User-Agent not allowed for this line", { status: 403 });

  const playbackUrl = await resolvePlaybackUrlForLine(line.id, cleanId, { clientIp: ip, userAgent: ua });
  if (!playbackUrl) return new NextResponse("Not found", { status: 404 });

  void trackConnection({
    lineId: line.id,
    streamId: cleanId,
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.redirect(playbackUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-cache" },
  });
}
