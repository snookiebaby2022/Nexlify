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
