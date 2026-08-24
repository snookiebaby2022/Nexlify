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

/** First Plex Genre tag, if the metadata included one. */
export function plexGenreName(item: { Genre?: unknown }): string | null {
  const g = item.Genre;
  if (typeof g === "string" && g.trim()) return g.trim();
  if (!Array.isArray(g)) return null;
  for (const x of g) {
    if (typeof x === "string" && x.trim()) return x.trim();
    if (x && typeof x === "object" && typeof (x as { tag?: unknown }).tag === "string") {
      const tag = String((x as { tag: string }).tag).trim();
      if (tag) return tag;
    }
  }
  return null;
}

export function plexSeriesTitleKey(name: string, seriesName?: string | null): string {
  if (seriesName?.trim()) return plexCatalogTitleKey(seriesName);
  const cut = name.replace(/\s*[—–|\-:]\s*s\d{1,2}e\d{1,3}\b[\s\S]*$/i, "");
  return plexCatalogTitleKey(cut);
}

function plexTagList(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return "";
  const tags: string[] = [];
  for (const x of value) {
    if (typeof x === "string" && x.trim()) tags.push(x.trim());
    else if (x && typeof x === "object" && typeof (x as { tag?: unknown }).tag === "string") {
      const tag = String((x as { tag: string }).tag).trim();
      if (tag) tags.push(tag);
    }
  }
  return tags.join(", ");
}

export function plexVodMetaFromItem(item: {
  summary?: string;
  year?: number | string;
  rating?: number | string;
  audienceRating?: number | string;
  originallyAvailableAt?: string;
  duration?: number;
  studio?: string;
  Genre?: unknown;
  Role?: unknown;
  Director?: unknown;
}): Record<string, unknown> {
  const plot = String(item.summary ?? "").trim();
  const year = item.year != null ? String(item.year).trim() : "";
  const release =
    String(item.originallyAvailableAt ?? "").slice(0, 10) || (year.length === 4 ? `${year}-01-01` : "");
  const ratingRaw = item.audienceRating ?? item.rating;
  const rating = ratingRaw != null && Number(ratingRaw) > 0 ? String(Number(ratingRaw).toFixed(1)) : "";
  const durationMs = Number(item.duration);
  const durationSecs = Number.isFinite(durationMs) && durationMs > 1000 ? Math.round(durationMs / 1000) : 0;
  return {
    plot,
    summary: plot,
    cast: plexTagList(item.Role),
    director: plexTagList(item.Director),
    genre: plexGenreName(item) ?? "",
    rating,
    releaseDate: release,
    durationSecs,
    studio: String(item.studio ?? "").trim(),
  };
}

export type PlexCatalogIndex = {
  movieKeys: Set<string>;
  seriesKeys: Set<string>;
  plexUrls: Set<string>;
  plexByUrl: Map<string, { id: string; type: StreamType }>;
  movieIdByKey: Map<string, string>;
  seriesIdByKey: Map<string, string>;
};

export async function loadPlexCatalogIndex(integrationId: string): Promise<PlexCatalogIndex> {
  const prefix = `${NEXLIFY_INTEGRATION}plex/${integrationId}/`;
  const rows = await prisma.stream.findMany({
    where: { type: { in: [StreamType.MOVIE, StreamType.SERIES] } },
    select: { id: true, name: true, seriesName: true, streamUrl: true, type: true, streamIcon: true },
  });
  const movieKeys = new Set<string>();
  const seriesKeys = new Set<string>();
  const plexUrls = new Set<string>();
  const plexByUrl = new Map<string, { id: string; type: StreamType }>();
  const movieIdByKey = new Map<string, string>();
  const seriesIdByKey = new Map<string, string>();
  for (const row of rows) {
    if (row.streamUrl.startsWith(prefix)) {
      plexUrls.add(row.streamUrl);
      plexByUrl.set(row.streamUrl, { id: row.id, type: row.type });
    }
    const hasIcon = Boolean(String(row.streamIcon ?? "").trim());
    if (row.type === StreamType.MOVIE) {
      const key = plexCatalogTitleKey(row.name);
      if (key) {
        movieKeys.add(key);
        if (!hasIcon && !movieIdByKey.has(key)) movieIdByKey.set(key, row.id);
      }
    } else {
      const key = plexSeriesTitleKey(row.name, row.seriesName);
      if (key) {
        seriesKeys.add(key);
        if (!hasIcon && !seriesIdByKey.has(key)) seriesIdByKey.set(key, row.id);
      }
    }
  }
  return { movieKeys, seriesKeys, plexUrls, plexByUrl, movieIdByKey, seriesIdByKey };
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
