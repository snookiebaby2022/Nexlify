import { NextResponse } from "next/server";
import { buildIceServers, getWebRtcSettings } from "@/lib/webrtc-config";

export const runtime = "nodejs";

/** Public ICE server list for WebRTC clients (no secrets beyond configured TURN). */
export async function GET() {
  const settings = await getWebRtcSettings();
  if (!settings.enabled) {
    return NextResponse.json({
      enabled: false,
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  }
  return NextResponse.json({
    enabled: true,
    iceServers: buildIceServers(settings),
    lowLatencyTargetMs: settings.lowLatencyTargetMs,
    fallbackToHls: settings.fallbackToHls,
  });
}
