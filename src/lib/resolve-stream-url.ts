import type { Stream, StreamProvider, StreamServer, VodMode } from "@prisma/client";
import { resolveProviderUrl } from "./vod-provider-url";
import { resolveStreamPlayUrl } from "./stream-variants";

export type StreamWithProvider = Stream & {
  provider?: StreamProvider | null;
  server?: StreamServer | null;
};

/** Effective playback URL for a stream (local, provider-hosted, on-demand, rotator, backup failover, or ABR primary). */
export function resolveStreamPlaybackUrl(stream: StreamWithProvider, seed?: string): string {
  const useBackup =
    stream.lastProbeOk === false && stream.backupUrl?.trim();
  const effective = useBackup
    ? { ...stream, streamUrl: stream.backupUrl!.trim() }
    : stream;

  if (effective.hostedExternally && effective.provider && effective.providerPath) {
    try {
      const url = resolveProviderUrl(effective.provider, effective.providerPath);
      return resolveStreamPlayUrl({ ...effective, streamUrl: url }, seed);
    } catch {
      return resolveStreamPlayUrl(effective, seed);
    }
  }

  const mode = effective.vodMode as VodMode;
  if ((mode === "ON_DEMAND" || mode === "CATCHUP") && effective.playlistUrl?.trim()) {
    return resolveStreamPlayUrl({ ...effective, streamUrl: effective.playlistUrl.trim() }, seed);
  }

  return resolveStreamPlayUrl(effective, seed);
}
export function vodModeLabel(mode: VodMode | string): string {
  switch (mode) {
    case "ON_DEMAND":
      return "On demand";
    case "CATCHUP":
      return "Catch-up";
    default:
      return "Live";
  }
}

export function syncVodModeFields(input: {
  isOnDemand?: boolean;
  vodMode?: VodMode | string;
}): { isOnDemand: boolean; vodMode: VodMode } {
  let vodMode = (input.vodMode ?? "LIVE") as VodMode;
  if (input.isOnDemand && vodMode === "LIVE") {
    vodMode = "ON_DEMAND";
  }
  if (!input.isOnDemand && vodMode === "ON_DEMAND" && input.vodMode === undefined) {
    vodMode = "LIVE";
  }
  const isOnDemand = input.isOnDemand ?? vodMode !== "LIVE";
  return { isOnDemand, vodMode };
}
