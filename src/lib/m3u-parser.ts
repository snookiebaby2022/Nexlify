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
      const tvgName = attr(line, "tvg-name")?.trim();
      const commaName = nameMatch?.[1]?.trim();
      // Prefer tvg-name for live IPTV playlists (cleaner channel titles).
      pending = {
        name: tvgName || commaName || "Unknown",
        group: attr(line, "group-title"),
        logo: attr(line, "tvg-logo"),
        tvgId: attr(line, "tvg-id"),
        tvgName: tvgName || undefined,
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
  const url = entry.url ?? "";
  const g = (entry.group ?? "").toLowerCase();

  // Xtream / provider path segments win over group-title wording
  if (/\/series\//i.test(url)) return "SERIES" as const;
  if (/\/movie\//i.test(url)) return "MOVIE" as const;
  if (/\/live\//i.test(url)) return "LIVE" as const;

  if (g.includes("series") || g.includes("tv show") || g.includes("tvshows")) {
    return "SERIES" as const;
  }
  // Require movie/vod as a group token — avoid matching "Live VOD Catchup" style titles as MOVIE
  if (/(^|[|\s/_-])(movies?|films?|vod|cinema)($|[|\s/_-])/i.test(g) && !/\blive\b/i.test(g)) {
    return "MOVIE" as const;
  }

  // Xtream m3u_plus mpegts live lines are often /user/pass/id (no /live/ segment).
  if (
    /\blive\b/i.test(g) ||
    /\.m3u8($|\?)/i.test(url) ||
    /\/[^/]+\/[^/]+\/\d+(\.(ts|m3u8))?($|\?)/i.test(url)
  ) {
    return "LIVE" as const;
  }

  if (/\.(mp4|mkv|avi|mov|m4v)($|\?)/i.test(url)) return "MOVIE" as const;

  // IPTV playlists are live-first; defaulting to MOVIE created false VOD rows.
  return "LIVE" as const;
}

/** Parse S01E05 / 1x05 style episode titles from provider M3U rows. */
export function parseSeriesFromM3uEntry(entry: M3uEntry): {
  seriesName: string;
  seasonNum: number;
  episodeNum: number;
  displayName: string;
} | null {
  const raw = (entry.tvgName?.trim() || entry.name?.trim() || "").replace(/\s+/g, " ");
  if (!raw) return null;

  const epMatch =
    raw.match(/\bS(\d{1,2})\s*[EeXx]\s*(\d{1,3})\b/i) ||
    raw.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (!epMatch) return null;

  const seasonNum = parseInt(epMatch[1], 10);
  const episodeNum = parseInt(epMatch[2], 10);
  if (!Number.isFinite(seasonNum) || !Number.isFinite(episodeNum)) return null;

  let seriesName = raw
    .replace(/\s*[-–|]\s*S\d{1,2}\s*[EeXx]\s*\d{1,3}.*$/i, "")
    .replace(/\s+S\d{1,2}\s*[EeXx]\s*\d{1,3}.*$/i, "")
    .replace(/\s+\d{1,2}x\d{1,3}.*$/i, "")
    .trim();
  if (!seriesName) seriesName = entry.group?.trim() || raw;
  seriesName = seriesName.slice(0, 200);

  const displayName = `${seriesName} S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
  return { seriesName, seasonNum, episodeNum, displayName: displayName.slice(0, 200) };
}
