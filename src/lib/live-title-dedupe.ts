import { normalizeStreamMatchKey } from "@/lib/stream-url-match";

/**
 * Identity for within-playlist LIVE dedupe: same Xtream numeric id on the same host,
 * else normalized URL. FHD/HD/SD rows use different ids/URLs and stay separate.
 */
export function livePlaylistEntryDedupeKey(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  const norm = normalizeStreamMatchKey(raw);
  if (norm) {
    const idMatch = norm.match(/\/(\d+)$/);
    if (idMatch?.[1]) {
      const host = norm.split("/")[0] ?? norm;
      return `xtream:${host}:${idMatch[1]}`;
    }
    return `url:${norm}`;
  }
  return `url:${raw.toLowerCase()}`;
}

/** Normalize live names so "Sky Sports Main Event FHD" matches itself across playlists. */
export function liveTitleQualityKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\[.*?\]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(uhd|fhd|hd|sd|hevc|hdr|4k|1080p|720p|576p|lb|hb|5\s*1)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function liveTitleExactKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
