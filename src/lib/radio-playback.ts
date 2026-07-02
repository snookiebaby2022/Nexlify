/** Client-safe: radio/audio URLs the browser can try to play. */
export function canPlayRadioInBrowser(url: string): boolean {
  const u = url.toLowerCase();
  const path = u.split("?")[0];
  if (path.endsWith(".m3u8") || u.includes(".m3u8")) return true;
  if (/\.(mp3|aac|ogg|opus|wav|flac)(\?|$)/i.test(path)) return true;
  if (path.endsWith(".m3u") && !path.endsWith(".m3u8")) return true;
  if (/^https?:\/\//i.test(url)) return true;
  return false;
}

export function isRadioHlsUrl(url: string): boolean {
  const u = url.toLowerCase();
  const path = u.split("?")[0];
  return path.endsWith(".m3u8") || u.includes(".m3u8");
}

export function isM3uPlaylist(url: string): boolean {
  const path = url.toLowerCase().split("?")[0];
  return path.endsWith(".m3u") && !path.endsWith(".m3u8");
}

/** Server-side: resolve .m3u playlist to first stream entry. */
export async function resolveRadioPlaybackUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!isM3uPlaylist(trimmed)) return trimmed;

  const res = await fetch(trimmed, {
    headers: { "User-Agent": "NexlifyPanel/1.0" },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) return trimmed;

  const text = await res.text();
  for (const line of text.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) continue;
    if (/^https?:\/\//i.test(entry)) return entry;
    try {
      return new URL(entry, trimmed).href;
    } catch {
      continue;
    }
  }
  return trimmed;
}
