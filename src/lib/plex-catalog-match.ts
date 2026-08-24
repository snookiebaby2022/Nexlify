import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import { NEXLIFY_INTEGRATION } from "@/lib/integration-stream-url";

/** Collapse a VOD/series title so Plex and IPTV catalog names can match. */
export function plexCatalogTitleKey(raw: string): string {
  let s = String(raw ?? "").toLowerCase();
  s = s.replace(/\(plex\)/g, " ");
  s = s.replace(/\(\d{4}\)/g, " ");
  s = s.replace(/\[.*?\]/g, " ");
  s = s.replace(/\b(19|20)\d{2}\b/g, " ");
  s = s.replace(
    /\b(4k|uhd|fhd|hd|sd|1080p|720p|480p|2160p|hevc|h\.?265|h\.?264|x265|x264|hdr10|hdr|dolby|atmos|web-?dl|blu-?ray|remux|proper|repack)\b/g,
    " "
  );
  s = s.replace(/^\s*\d+[.)]\s+/, " ");
  s = s.replace(/s\d{1,2}e\d{1,3}\b[\s\S]*$/g, " ");
  return s.replace(/[^a-z0-9]/g, "");
}

export function plexSeriesTitleKey(name: string, seriesName?: string | null): string {
  if (seriesName?.trim()) return plexCatalogTitleKey(seriesName);
  const cut = name.replace(/\s*[—–|\-:]\s*s\d{1,2}e\d{1,3}\b[\s\S]*$/i, "");
  return plexCatalogTitleKey(cut);
}

export type PlexCatalogIndex = {
  movieKeys: Set<string>;
  seriesKeys: Set<string>;
  plexUrls: Set<string>;
};

export async function loadPlexCatalogIndex(integrationId: string): Promise<PlexCatalogIndex> {
  const prefix = `${NEXLIFY_INTEGRATION}plex/${integrationId}/`;
  const rows = await prisma.stream.findMany({
    where: { type: { in: [StreamType.MOVIE, StreamType.SERIES] } },
    select: { name: true, seriesName: true, streamUrl: true, type: true },
  });
  const movieKeys = new Set<string>();
  const seriesKeys = new Set<string>();
  const plexUrls = new Set<string>();
  for (const row of rows) {
    if (row.streamUrl.startsWith(prefix)) plexUrls.add(row.streamUrl);
    if (row.type === StreamType.MOVIE) {
      const key = plexCatalogTitleKey(row.name);
      if (key) movieKeys.add(key);
    } else {
      const key = plexSeriesTitleKey(row.name, row.seriesName);
      if (key) seriesKeys.add(key);
    }
  }
  return { movieKeys, seriesKeys, plexUrls };
}

export function plexScheduleHours(raw: unknown): 12 | 24 {
  const s = String(raw ?? "12h").trim().toLowerCase();
  if (s === "24" || s === "24h" || s === "daily") return 24;
  return 12;
}

/** True when enough time has passed since the last successful auto-sync. */
export function plexAutoSyncIsDue(lastRunIso: string | null | undefined, intervalHours: 12 | 24, now = Date.now()): boolean {
  if (!lastRunIso) return true;
  const last = Date.parse(lastRunIso);
  if (!Number.isFinite(last)) return true;
  const minGapMs = (intervalHours * 60 - 20) * 60_000;
  return now - last >= minGapMs;
}
