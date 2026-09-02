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
 * Live only (vodMode LIVE) splices through the panel. Direct is only the
 * explicit Direct source toggle. On-demand / hosted-provider stay on-demand
 * until the operator switches mode.
 */
export function getStreamPlaybackPolicy(stream: StreamForPlaybackPolicy): StreamPlaybackPolicyMode {
  const mode = stream.vodMode as VodMode;
  if (stream.isCreatedChannel) return "created";
  if (mode === "CATCHUP") return "catchup";

  const meta = parseLiveStreamMeta(stream.agentStartCmd);
  const transcoding = Boolean(meta.transcodeProfile && meta.transcodeProfile !== "none");
  if (transcoding) return "transcode";

  if (mode === "ON_DEMAND" || (mode !== "LIVE" && stream.isOnDemand)) return "on_demand";

  // Direct source is the explicit toggle. Leftover XUI redirectStream must not
  // override operator-selected Live only — that was showing as Direct.
  if (meta.directSource) return "direct";

  if (mode === "LIVE") {
    if (isExternalHttpUrl(stream.streamUrl ?? "")) return "relay";
    return "transcode";
  }

  if (stream.hostedExternally === true || meta.redirectStream) return "direct";

  if (isExternalHttpUrl(stream.streamUrl ?? "")) return "relay";

  return "transcode";
}

/** On-demand streams spin up the provider on first viewer — QoE needs a warmup grace. */
export function streamUsesOnDemandWarmup(stream: {
  vodMode?: string | null;
  isOnDemand?: boolean | null;
}): boolean {
  if (stream.vodMode === "LIVE") return false;
  return stream.vodMode === "ON_DEMAND" || Boolean(stream.isOnDemand);
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

/** List badge/mode: operator stream mode wins. Live only → Live unless Direct source is on. */
export function streamListUptimeKind(
  stream: {
    hostedExternally?: boolean | null;
    isOnDemand?: boolean | null;
    isCreatedChannel?: boolean | null;
    vodMode?: string | null;
    agentStartCmd?: string | null;
    liveStats?: { playbackMode?: StreamPlaybackPolicyMode } | null;
  },
  listType?: string
): "DIRECT" | "LIVE" | "ON-DEMAND" | "CATCHUP" {
  if (stream.vodMode === "CATCHUP") return "CATCHUP";
  if (stream.vodMode === "LIVE") {
    const meta = parseLiveStreamMeta(stream.agentStartCmd);
    if (meta.directSource) return "DIRECT";
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
