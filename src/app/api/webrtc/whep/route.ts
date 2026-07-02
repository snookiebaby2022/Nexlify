import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { getLineForPlaybackAuth, resolvePlaybackUrlForLine } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import {
  assertPlaybackAllowed,
  asPlaybackGuardLine,
  playbackDenyMessage,
} from "@/lib/playback-guard";
import { getWebRtcSettings } from "@/lib/webrtc-config";
import {
  exchangeWhepOffer,
  prepareStreamWhep,
  teardownWhepSession,
} from "@/lib/webrtc-gateway";
import { prisma } from "@/lib/prisma";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { trackConnection } from "@/lib/connections";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const settings = await getWebRtcSettings();
  if (!settings.enabled) {
    return NextResponse.json({ error: "WebRTC is disabled on this panel" }, { status: 503 });
  }

  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "").trim();
  const streamId = String(body.streamId ?? "").trim();
  const offerSdp = String(body.sdp ?? "").trim();

  if (!username || !password || !streamId || !offerSdp) {
    return NextResponse.json(
      { error: "username, password, streamId, and sdp are required" },
      { status: 400 }
    );
  }

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? undefined;

  const line = await getLineForPlaybackAuth(username);
  if (!line || line.password !== password || !lineIsPlayable(line)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deny = await assertPlaybackAllowed(asPlaybackGuardLine(line), ip, ua);
  if (deny) {
    return NextResponse.json({ error: playbackDenyMessage(deny) }, { status: 403 });
  }

  const stream = await prisma.stream.findFirst({
    where: {
      id: streamId,
      isActive: true,
      type: "LIVE",
      bouquets: {
        some: {
          bouquet: {
            isActive: true,
            lines: { some: { lineId: line.id } },
          },
        },
      },
    },
    include: { provider: true, server: true },
  });

  if (!stream) {
    return NextResponse.json({ error: "Stream not found or not in bouquet" }, { status: 404 });
  }

  const sourceUrl = resolveStreamPlaybackUrl(stream);
  const serverHost =
    stream.server?.domain?.trim() ||
    stream.server?.host?.trim() ||
    null;

  let whepUrl: string;
  try {
    whepUrl = await prepareStreamWhep(settings, streamId, sourceUrl, serverHost);
    const { answerSdp, sessionUrl } = await exchangeWhepOffer(whepUrl, offerSdp);

    void trackConnection({ lineId: line.id, streamId, ip, userAgent: ua });

    return NextResponse.json({
      answerSdp,
      sessionUrl,
      whepUrl,
      mode: "webrtc",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (settings.fallbackToHls) {
      const hlsUrl = await resolvePlaybackUrlForLine(line.id, streamId, { clientIp: ip, userAgent: ua });
      if (hlsUrl) {
        return NextResponse.json(
          {
            error: message,
            fallbackHlsUrl: hlsUrl,
            mode: "hls-fallback",
          },
          { status: 502 }
        );
      }
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionUrl = String(body.sessionUrl ?? "").trim();
  if (!sessionUrl) {
    return NextResponse.json({ error: "sessionUrl required" }, { status: 400 });
  }
  await teardownWhepSession(sessionUrl);
  return NextResponse.json({ ok: true });
}
