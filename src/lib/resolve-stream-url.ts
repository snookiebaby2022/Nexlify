import type { Stream, StreamProvider, StreamServer, VodMode } from "@prisma/client";
import { resolveProviderUrl } from "./vod-provider-url";
import { resolveStreamPlayUrl } from "./stream-variants";

export type StreamWithProvider = Stream & {
  provider?: StreamProvider | null;
  server?: StreamServer | null;
};

function resolveEffectiveStreamUrl(stream: StreamWithProvider, streamUrl: string, seed?: string): string {
  const effective = { ...stream, streamUrl };

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

/** Effective playback URL for a stream (local, provider-hosted, on-demand, rotator, backup failover, or ABR primary). */
export function resolveStreamPlaybackUrl(stream: StreamWithProvider, seed?: string): string {
  const useBackup = stream.lastProbeOk === false && stream.backupUrl?.trim();
  const url = useBackup ? stream.backupUrl!.trim() : stream.streamUrl;
  return resolveEffectiveStreamUrl(stream, url, seed);
}

/** Ordered candidate URLs for live playback (primary then backup). Used when upstream fetch fails at request time. */
export function listStreamPlaybackUrls(stream: StreamWithProvider, seed?: string): string[] {
  const primary = resolveEffectiveStreamUrl(stream, stream.streamUrl, seed);
  const out: string[] = [primary];
  const backupRaw = stream.backupUrl?.trim();
  if (backupRaw) {
    const backup = resolveEffectiveStreamUrl(
      { ...stream, bitrates: null },
      backupRaw,
      seed
    );
    if (backup && !out.includes(backup)) out.push(backup);
  }
  if (stream.lastProbeOk === false && out.length > 1) {
    return [out[1]!, out[0]!, ...out.slice(2)];
  }
  return out;
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
  const raw = String(input.vodMode ?? "").trim().toUpperCase();
  let vodMode: VodMode =
    raw === "ON_DEMAND" || raw === "CATCHUP" || raw === "LIVE"
      ? (raw as VodMode)
      : // Movie/series forms historically sent "MOVIE"/"SERIES" — map to on-demand.
        raw === "MOVIE" || raw === "SERIES" || raw === "VOD"
        ? "ON_DEMAND"
        : "LIVE";

  if (input.isOnDemand === true && vodMode === "LIVE") {
    vodMode = "ON_DEMAND";
  }
  if (input.isOnDemand === false && (vodMode === "ON_DEMAND" || vodMode === "CATCHUP") && input.vodMode === undefined) {
    vodMode = "LIVE";
  }
  const isOnDemand = vodMode !== "LIVE";
  return { isOnDemand, vodMode };
}
