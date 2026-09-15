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
    "",
  );
  s = s.replace(
    /\b(4k|uhd|fhd|hd|sd|1080p|720p|576p|480p|2160p|hevc|hdr|hdr10|dv)\b/g,
    " ",
  );
  s = s.replace(/[^a-z0-9]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Unlabelled feeds (e.g. "UK: SKY CINEMA PREMIERE") group with FHD, not HD/SD. */
export function liveDuplicateTierForGrouping(name: string): LiveQualityTier {
  const tier = liveStreamQualityTier(name);
  return tier === "unknown" ? "fhd" : tier;
}
