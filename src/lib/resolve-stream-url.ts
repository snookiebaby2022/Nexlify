import type { Stream, StreamProvider, StreamServer, VodMode } from "@prisma/client";
import { resolveProviderUrl } from "./vod-provider-url";
import { parseBitrates, resolveStreamPlayUrl } from "./stream-variants";
import { repairMalformedStreamUrl } from "./stream-source";

export type StreamWithProvider = Stream & {
  provider?: StreamProvider | null;
  server?: StreamServer | null;
};

/** Some XUI providers break on explicit :443 in https URLs (empty 200 body from Cloudflare). */
export function normalizeUpstreamStreamUrl(url: string): string {
  const t = repairMalformedStreamUrl(url.trim());
  if (!t) return t;
  try {
    const u = new URL(t);
    if (u.protocol === "https:" && u.port === "443") {
      u.port = "";
      return u.toString();
    }
    if (u.protocol === "http:" && u.port === "80") {
      u.port = "";
      return u.toString();
    }
    return u.toString();
  } catch {
    return t;
  }
}

/** XUI-style: try normalized URL first, then the alternate scheme if playback fails. */
export function alternateProtocolUrls(url: string): string[] {
  const normalized = normalizeUpstreamStreamUrl(url);
  const out: string[] = [];
  const add = (u: string) => {
    const t = u.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(normalized);
  try {
    const u = new URL(normalized);
    if (u.protocol === "https:") {
      const http = new URL(u.toString());
      http.protocol = "http:";
      add(http.toString());
    } else if (u.protocol === "http:") {
      const https = new URL(u.toString());
      https.protocol = "https:";
      add(https.toString());
    }
  } catch {
    add(url);
  }
  return out;
}

function resolveEffectiveStreamUrl(stream: StreamWithProvider, streamUrl: string, seed?: string): string {
  const effective = { ...stream, streamUrl: normalizeUpstreamStreamUrl(streamUrl) };

  if (effective.hostedExternally && effective.provider && effective.providerPath) {
    try {
      const providerUrl = resolveProviderUrl(effective.provider, effective.providerPath);
      const raw = streamUrl.trim();
      // Migrated XUI rows often have both a provider id path and a real stream_source URL.
      // Prefer stream_source when it is already http(s) on a different host.
      if (/^https?:\/\//i.test(raw)) {
        try {
          const rawHost = new URL(raw).hostname.toLowerCase();
          const provHost = new URL(providerUrl).hostname.toLowerCase();
          if (rawHost && provHost && rawHost !== provHost) {
            return resolveStreamPlayUrl(effective, seed);
          }
        } catch {
          /* fall through to provider URL */
        }
      }
      return resolveStreamPlayUrl({ ...effective, streamUrl: providerUrl }, seed);
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
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    const t = String(u ?? "").trim();
    if (!t || !/^https?:\/\//i.test(t) || out.includes(t)) return;
    out.push(t);
  };

  add(resolveEffectiveStreamUrl(stream, stream.streamUrl, seed));
  add(normalizeUpstreamStreamUrl(stream.streamUrl));
  const backupRaw = stream.backupUrl?.trim();
  if (backupRaw) {
    add(
      resolveEffectiveStreamUrl(
        { ...stream, bitrates: null, hostedExternally: false },
        backupRaw,
        seed
      )
    );
    add(backupRaw);
  }
  if (stream.hostedExternally && stream.provider && stream.providerPath) {
    try {
      add(resolveProviderUrl(stream.provider, stream.providerPath));
    } catch {
      /* ignore invalid provider path */
    }
  }
  for (const variant of parseBitrates(stream.bitrates)) {
    add(variant.path);
  }
  const withAlternates: string[] = [];
  for (const u of out) {
    for (const alt of alternateProtocolUrls(u)) {
      if (!withAlternates.includes(alt)) withAlternates.push(alt);
    }
  }
  if (stream.lastProbeOk === false && withAlternates.length > 1) {
    return [withAlternates[1]!, withAlternates[0]!, ...withAlternates.slice(2)];
  }
  return withAlternates;
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
