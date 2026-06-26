import type { Stream, StreamProvider, StreamServer, VodMode } from "@prisma/client";
import { resolveProviderUrl } from "./vod-provider-url";
import { resolveStreamPlayUrl } from "./stream-variants";

export type StreamWithProvider = Stream & {
  provider?: StreamProvider | null;
  server?: StreamServer | null;
};

/** Effective playback URL for a stream (local, provider-hosted, on-demand, rotator, or ABR primary). */
export function resolveStreamPlaybackUrl(stream: StreamWithProvider, seed?: string): string {
  if (stream.hostedExternally && stream.provider && stream.providerPath) {
    try {
      const url = resolveProviderUrl(stream.provider, stream.providerPath);
      return resolveStreamPlayUrl({ ...stream, streamUrl: url }, seed);
    } catch {
      return resolveStreamPlayUrl(stream, seed);
    }
  }

  const mode = stream.vodMode as VodMode;
  if ((mode === "ON_DEMAND" || mode === "CATCHUP") && stream.playlistUrl?.trim()) {
    return resolveStreamPlayUrl({ ...stream, streamUrl: stream.playlistUrl.trim() }, seed);
  }

  return resolveStreamPlayUrl(stream, seed);
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
