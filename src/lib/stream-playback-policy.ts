import type { VodMode } from "@prisma/client";
import { parseLiveStreamMeta } from "@/lib/stream-live-meta";
import type { StreamForPlaybackMode as LockedStreamForPlaybackMode } from "@/lib/stream-playback-mode";

export type StreamPlaybackPolicyMode =
  | "direct"
  | "relay"
  | "on_demand"
  | "transcode"
  | "catchup"
  | "created";

export type StreamForPlaybackPolicy = LockedStreamForPlaybackMode;

function isExternalHttpUrl(url: string): boolean {
  const t = url.trim();
  return (
    /^https?:\/\//i.test(t) &&
    !t.includes("127.0.0.1") &&
    !/localhost/i.test(t) &&
    !t.startsWith("file://")
  );
}

/**
 * Provider DIRECT only when “hosted by provider URL” (or Redirect stream) is on.
 * Other live HTTP(S) is instant panel/edge relay — no ffmpeg wait.
 */
export function getStreamPlaybackPolicy(stream: StreamForPlaybackPolicy): StreamPlaybackPolicyMode {
  const mode = stream.vodMode as VodMode;
  if (stream.isCreatedChannel) return "created";
  if (mode === "CATCHUP") return "catchup";

  const meta = parseLiveStreamMeta(stream.agentStartCmd);
  const transcoding = Boolean(meta.transcodeProfile && meta.transcodeProfile !== "none");
  if (transcoding) return "transcode";

  if (stream.hostedExternally === true || meta.redirectStream) return "direct";

  if (isExternalHttpUrl(stream.streamUrl ?? "")) return "relay";

  if (mode === "ON_DEMAND" || stream.isOnDemand) return "on_demand";

  return "transcode";
}

export function playbackPolicyLabel(mode: StreamPlaybackPolicyMode): string {
  switch (mode) {
    case "direct":
      return "Live on-demand";
    case "relay":
      return "Live";
    case "on_demand":
      return "Live on-demand";
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

/** Manage Streams Uptime column: DIRECT / LIVE / ON-DEMAND (plus CATCHUP). */
export function streamUptimeColumnLabel(
  mode: StreamPlaybackPolicyMode
): "DIRECT" | "LIVE" | "ON-DEMAND" | "CATCHUP" {
  switch (mode) {
    case "direct":
      return "DIRECT";
    case "on_demand":
    case "created":
      return "ON-DEMAND";
    case "catchup":
      return "CATCHUP";
    default:
      return "LIVE";
  }
}

export function streamNeedsAlwaysOnProcessPolicy(stream: StreamForPlaybackPolicy): boolean {
  return getStreamPlaybackPolicy(stream) === "transcode";
}

/** Kill agent ffmpeg when nobody is watching. Transcode stays in agent config so it can start on tune-in. */
export function shouldStopIdleAgentProcess(
  mode: StreamPlaybackPolicyMode,
  viewerCount: number
): boolean {
  return viewerCount <= 0;
}

/** Panel/edge splices live without a persistent agent process. */
export function streamPlaysInstantThroughServers(stream: StreamForPlaybackPolicy): boolean {
  const mode = getStreamPlaybackPolicy(stream);
  return mode === "direct" || mode === "relay";
}
