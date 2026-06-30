/** Fast path checks before network probe */
export function isLikelyDirectPlayUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return (
    u.endsWith(".m3u8") ||
    u.endsWith(".ts") ||
    u.endsWith(".mp4") ||
    u.endsWith(".m4v") ||
    u.includes(".m3u8")
  );
}

export function probeTimeoutMs(fast?: boolean): number {
  const base = Number(process.env.STREAM_PROBE_TIMEOUT_MS ?? "4000");
  return fast ? Math.min(base, 2500) : base;
}

/** Client-safe: URLs the browser video element or Hls.js can try to play. */
export function canPlayInBrowser(url: string): boolean {
  const u = url.toLowerCase();
  const path = u.split("?")[0];
  if (
    path.endsWith(".mp4") ||
    path.endsWith(".m4v") ||
    path.endsWith(".webm") ||
    path.endsWith(".m3u8") ||
    u.includes(".m3u8") ||
    path.endsWith(".ts")
  ) {
    return true;
  }
  // Live IPTV / Xtream-style URLs (http(s) without obvious extension)
  if (/^https?:\/\//i.test(url.trim())) return true;
  return false;
}
