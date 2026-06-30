import type { Stream, VodMode } from "@prisma/client";
import { parseLiveStreamMeta } from "@/lib/stream-live-meta";

export type StreamPlaybackMode =
  | "direct"
  | "on_demand"
  | "transcode"
  | "catchup"
  | "created";

export type StreamForPlaybackMode = Pick<
  Stream,
  | "vodMode"
  | "isOnDemand"
  | "isCreatedChannel"
  | "agentStartCmd"
  | "autoRestart"
  | "streamUrl"
  | "hostedExternally"
>;

/** XUI / 1-Stream style delivery mode for a live channel. */
export function getStreamPlaybackMode(stream: StreamForPlaybackMode): StreamPlaybackMode {
  const mode = stream.vodMode as VodMode;
  if (stream.isCreatedChannel) return "created";
  if (mode === "CATCHUP") return "catchup";
  if (mode === "ON_DEMAND" || stream.isOnDemand) return "on_demand";

  const meta = parseLiveStreamMeta(stream.agentStartCmd);
  if (meta.redirectStream) return "direct";

  // External HTTP(S) live sources default to direct relay (no always-on ffmpeg) — XUI default.
  const url = stream.streamUrl?.trim() ?? "";
  if (
    !stream.autoRestart &&
    !stream.hostedExternally &&
    /^https?:\/\//i.test(url) &&
    !url.includes("127.0.0.1") &&
    !url.startsWith("file://")
  ) {
    return "direct";
  }

  return "transcode";
}

export function playbackModeLabel(mode: StreamPlaybackMode): string {
  switch (mode) {
    case "direct":
      return "Direct";
    case "on_demand":
      return "On demand";
    case "transcode":
      return "Transcode";
    case "catchup":
      return "Catch-up";
    case "created":
      return "Created";
    default:
      return mode;
  }
}

/** Agent should keep ffmpeg running for this stream (always-on transcode). */
export function streamNeedsAlwaysOnProcess(stream: StreamForPlaybackMode): boolean {
  return getStreamPlaybackMode(stream) === "transcode";
}

/** Panel proxies upstream on /live/ without a persistent agent process. */
export function streamUsesDirectRelay(stream: StreamForPlaybackMode): boolean {
  return getStreamPlaybackMode(stream) === "direct";
}
