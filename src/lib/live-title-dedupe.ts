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

export type LiveQualityTier = "uhd" | "fhd" | "hd" | "sd" | "unknown";

/** Explicit quality suffix in the display name (FHD/HD/SD stay separate). */
export function liveStreamQualityTier(name: string): LiveQualityTier {
  const n = String(name ?? "").toLowerCase();
  if (/\b(4k|uhd|2160p)\b/.test(n)) return "uhd";
  if (/\bfhd\b|\b1080p\b/.test(n)) return "fhd";
  if (/\bhevc\b/.test(n)) return "hd";
  if (/\bhd\b|\b720p\b/.test(n)) return "hd";
  if (/\bsd\b|\b480p\b|\b576p\b/.test(n)) return "sd";
  return "unknown";
}

/** Channel identity without country prefix or quality tokens — for alias duplicate detection. */
export function liveCanonicalChannelKey(name: string): string {
  let s = String(name ?? "").toLowerCase();
  s = s.replace(/\[.*?\]/g, " ");
  s = s.replace(/\(.*?\)/g, " ");
  s = s.replace(
    /^(uk|us|usa|ie|ca|au|nz|ar|ae|in|pk|gr|de|fr|es|it|pt|nl|be|pl|tr|ru|ro|al|exyu)\s*[|:]\s*/,
    ""
  );
  s = s.replace(
    /\b(4k|uhd|fhd|hd|sd|1080p|720p|576p|480p|2160p|hevc|hdr|hdr10|dv)\b/g,
    " "
  );
  s = s.replace(/[^a-z0-9]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Unlabelled feeds (e.g. "UK: SKY CINEMA PREMIERE") group with FHD, not HD/SD. */
export function liveDuplicateTierForGrouping(name: string): LiveQualityTier {
  const tier = liveStreamQualityTier(name);
  return tier === "unknown" ? "fhd" : tier;
}

export function liveExactDuplicateKey(name: string, categoryId: string | null | undefined): string {
  const exact = liveTitleExactKey(name);
  if (!exact) return "";
  return `${categoryId ?? ""}::${exact}`;
}

export function liveAliasDuplicateKey(name: string, categoryId: string | null | undefined): string {
  const canonical = liveCanonicalChannelKey(name);
  if (!canonical) return "";
  const tier = liveDuplicateTierForGrouping(name);
  return `${categoryId ?? ""}::${canonical}::${tier}`;
}
