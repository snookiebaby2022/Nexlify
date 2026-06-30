export type M3uEntry = {
  name: string;
  url: string;
  group?: string;
  logo?: string;
  tvgId?: string;
};

export function parseM3u(content: string): M3uEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: M3uEntry[] = [];
  let pending: Partial<M3uEntry> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/,(.+)$/);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      pending = {
        name: nameMatch?.[1]?.trim() ?? "Unknown",
        group: groupMatch?.[1],
        logo: logoMatch?.[1],
        tvgId: idMatch?.[1],
      };
      continue;
    }

    if (line.startsWith("#")) continue;

    if (
      pending &&
      (line.startsWith("http") ||
        line.startsWith("file://") ||
        line.startsWith("/") ||
        line.startsWith("rtmp"))
    ) {
      entries.push({
        name: pending.name!,
        url: line,
        group: pending.group,
        logo: pending.logo,
        tvgId: pending.tvgId,
      });
      pending = null;
    }
  }

  return entries;
}

export function guessStreamType(entry: M3uEntry, forced?: "LIVE" | "MOVIE" | "SERIES") {
  if (forced) return forced;
  const g = (entry.group ?? "").toLowerCase();
  if (g.includes("series") || g.includes("tv show")) return "SERIES" as const;
  if (g.includes("movie") || g.includes("vod")) return "MOVIE" as const;
  if (g.includes("live") || entry.url.includes(".m3u8")) return "LIVE" as const;
  return "MOVIE" as const;
}
