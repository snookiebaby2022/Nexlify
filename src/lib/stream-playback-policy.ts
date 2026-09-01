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

  if (mode === "ON_DEMAND" || (mode !== "LIVE" && stream.isOnDemand)) return "on_demand";

  return "transcode";
}

export function playbackPolicyLabel(mode: StreamPlaybackPolicyMode): string {
  switch (mode) {
    case "direct":
      return "Direct";
    case "relay":
    case "transcode":
      return "Live";
    case "on_demand":
    case "created":
      return "On-demand";
    case "catchup":
      return "Catch-up";
    default:
      return mode;
  }
}

/** Manage Streams Uptime badge — short words operators can scan. */
export function streamUptimeDisplayLabel(
  kind: "DIRECT" | "LIVE" | "ON-DEMAND" | "CATCHUP"
): string {
  switch (kind) {
    case "DIRECT":
      return "Direct";
    case "ON-DEMAND":
      return "On-demand";
    case "CATCHUP":
      return "Catch-up";
    default:
      return "Live";
  }
}

/** List badge/mode: on-demand wins over provider-direct so operators see how it starts. */
export function streamListUptimeKind(
  stream: {
    hostedExternally?: boolean | null;
    isOnDemand?: boolean | null;
    isCreatedChannel?: boolean | null;
    vodMode?: string | null;
    liveStats?: { playbackMode?: StreamPlaybackPolicyMode } | null;
  },
  listType?: string
): "DIRECT" | "LIVE" | "ON-DEMAND" | "CATCHUP" {
  if (stream.vodMode === "CATCHUP") return "CATCHUP";
  if (stream.vodMode === "LIVE") {
    if (stream.liveStats?.playbackMode) {
      return streamUptimeColumnLabel(stream.liveStats.playbackMode);
    }
    if (stream.hostedExternally) return "DIRECT";
    return "LIVE";
  }
  if (
    stream.isCreatedChannel ||
    stream.isOnDemand ||
    stream.vodMode === "ON_DEMAND" ||
    listType === "MOVIE" ||
    listType === "SERIES"
  ) {
    return "ON-DEMAND";
  }
  if (stream.liveStats?.playbackMode) {
    return streamUptimeColumnLabel(stream.liveStats.playbackMode);
  }
  if (stream.hostedExternally) return "DIRECT";
  return "LIVE";
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
