/** Client-safe title cleanup for TMDB search (no server imports). */
export function cleanTitleForTmdb(name: string): string {
  return name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\s*\(\d{4}\)\s*$/i, "")
    .replace(/\s*\[\d{4}\]\s*$/i, "")
    .replace(/\s*\((plex|emby|jellyfin|youtube|spotify|deezer)\)\s*$/i, "")
    .replace(/\s*S\d{1,2}E\d{1,2}\s*/gi, " ")
    .replace(/\s*\d{1,2}x\d{1,2}\s*/gi, " ")
    .replace(/\s*-\s*Season\s*\d+/gi, "")
    .replace(
      /\b(1080p|720p|480p|2160p|4k|uhd|hdr|hdr10|dv|dolby\s*vision|web-?dl|webrip|bluray|blu-?ray|x264|x265|h\.?264|h\.?265|hevc|aac|dts|truehd|remux|proper|repack|extended|unrated|directors?\s*cut|multi|dual\s*audio|nf|amzn|dsnp|hulu|itunes)\b/gi,
      " "
    )
    .replace(/\b(COMPLETE|PACK|BOXSET|COLLECTION)\b/gi, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
