export type M3uEntry = {
  name: string;
  url: string;
  group?: string;
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  channelId?: string;
};

function attr(line: string, name: string): string | undefined {
  const dq = line.match(new RegExp(`${name}="([^"]*)"`, "i"));
  if (dq?.[1] != null) return dq[1];
  const sq = line.match(new RegExp(`${name}='([^']*)'`, "i"));
  if (sq?.[1] != null) return sq[1];
  return undefined;
}

function isStreamUrlLine(line: string): boolean {
  if (!line || line.startsWith("#")) return false;
  if (/^(https?|rtmp|rtmps|rtsp|rtsps|udp|rtp|srt|mms|mmsh|file):\/\//i.test(line)) return true;
  if (line.startsWith("//")) return true;
  if (line.startsWith("/")) return true;
  if (line.includes("://")) return true;
  if (/^[a-z0-9.-]+:\d+\//i.test(line)) return true;
  return false;
}

export function parseM3u(content: string): M3uEntry[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const entries: M3uEntry[] = [];
  let pending: Partial<M3uEntry> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const nameMatch = line.match(/,(.+)$/);
      pending = {
        name: nameMatch?.[1]?.trim() || attr(line, "tvg-name") || "Unknown",
        group: attr(line, "group-title"),
        logo: attr(line, "tvg-logo"),
        tvgId: attr(line, "tvg-id"),
        tvgName: attr(line, "tvg-name"),
        channelId: attr(line, "channel-id") ?? attr(line, "channel_id"),
      };
      continue;
    }

    // Keep pending through VLC/Kodi option lines sitting between EXTINF and the URL.
    if (line.startsWith("#")) continue;

    if (pending && isStreamUrlLine(line)) {
      entries.push({
        name: pending.name || "Unknown",
        url: line,
        group: pending.group,
        logo: pending.logo,
        tvgId: pending.tvgId,
        tvgName: pending.tvgName,
        channelId: pending.channelId,
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
  if (g.includes("live") || /\.m3u8($|\?)/i.test(entry.url) || /\/live\//i.test(entry.url)) {
    return "LIVE" as const;
  }
  return "MOVIE" as const;
}
