import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";

if (typeof process !== "undefined") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { asPlaybackGuardLine, assertPlaybackAllowed } from "@/lib/playback-guard";
import { trackConnection } from "@/lib/connections";
import { getLineForPlaybackAuth, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { rejectDemoIptvPlayback } from "@/lib/iptv-route-guard";
import { iptvCorsPreflight, iptvText, withIptvCors } from "@/lib/iptv-cors";
import { resolveStreamIdParam } from "@/lib/xtream-stream-id";

export const runtime = "nodejs";

export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const demoBlock = rejectDemoIptvPlayback(req);
  if (demoBlock) return demoBlock;

  const { username, password, streamId } = await ctx.params;
  const ip = getClientIp(req);

  const cleanId = (await resolveStreamIdParam(streamId, { username })) ?? streamId.replace(/\.(ts|m3u8|mp4|mkv|avi|mov|webm)$/i, "");

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return iptvText("Unauthorized", { status: 401 });
  }

  const ua = req.headers.get("user-agent") ?? undefined;
  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua, {
    streamId: cleanId,
  });
  if (deny === "ip") return iptvText("IP not allowed for this line", { status: 403 });
  if (deny === "connections") {
    return iptvText(
      "Max connections reached. You are using all allowed streams. Please disconnect another device or increase your connection limit in the panel.",
      { status: 403 }
    );
  }
  if (deny === "rate") return iptvText("Rate limit exceeded", { status: 429 });
  if (deny === "blocklist") return iptvText("Access blocked", { status: 403 });
  if (deny === "country") return iptvText("Country not allowed", { status: 403 });
  if (deny === "vpn") return iptvText("VPN or hosting not allowed", { status: 403 });
  if (deny === "user_agent") return iptvText("User-Agent not allowed for this line", { status: 403 });
  if (deny === "ddos") return iptvText("Access temporarily blocked", { status: 429 });
  if (deny === "kicked") return iptvText("Session kicked", { status: 403 });
  if (deny) return iptvText("Playback denied", { status: 403 });

  const playbackUrl = await resolvePlaybackUrlForLine(line.id, cleanId, { clientIp: ip, userAgent: ua });
  if (!playbackUrl) return iptvText("Not found", { status: 404 });

  void trackConnection({
    lineId: line.id,
    streamId: cleanId,
    ip,
    userAgent: ua,
  });

  return withIptvCors(
    NextResponse.redirect(playbackUrl, {
      status: 302,
      headers: { "Cache-Control": "private, no-cache" },
    })
  );
}
