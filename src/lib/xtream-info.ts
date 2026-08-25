import type { LineWithBouquets } from "./lines";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import {
  cuidToNum,
  resolveStreamIdParam,
  seriesEpisodeIdsForLine,
} from "./xtream-stream-id";
import { xtreamListingExtension, xtreamSafeText } from "./xtream-safe";
import {
  buildCanonicalCategoryMaps,
  canonicalNumericForCategory,
} from "./xtream-category-canonical";
import { parseXtreamVodMeta } from "./vod-meta";

export { cuidToNum, resolveStreamIdParam };

function parseMetaJson(raw: string | null | undefined): Record<string, unknown> {
  return parseXtreamVodMeta(raw);
}

function metaText(value: unknown): string {
  if (value == null || typeof value === "object") return "";
  return xtreamSafeText(value);
}

function metaNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function backdropPath(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [xtreamSafeText(value)];
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => xtreamSafeText(v));
  }
  return [];
}

export function emptyXtreamSeriesInfo() {
  return {
    seasons: [] as { season_number: number; name: string; cover: string }[],
    info: {
      name: "",
      cover: "",
      plot: "",
      cast: "",
      director: "",
      genre: "",
      releaseDate: "",
      last_modified: "0",
      rating: "0",
      rating_5based: 0,
      backdrop_path: [] as string[],
      youtube_trailer: "",
      episode_run_time: "0",
      category_id: "0",
    },
    episodes: {} as Record<string, unknown[]>,
  };
}

/** Xtream get_vod_info response for a movie on the line. */
export async function xtreamVodInfo(
  line: LineWithBouquets,
  _baseUrl: string,
  streamIdParam: string
) {
  const streamId = await resolveStreamIdParam(streamIdParam, { lineId: line.id });
  if (!streamId) return null;

  const full = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { category: true },
  });
  if (!full || full.type !== StreamType.MOVIE) return null;

  const meta = parseMetaJson(full.agentStartCmd);
  const ext = xtreamListingExtension(full.containerExtension, "mp4", full.streamUrl);
  const canonical = await buildCanonicalCategoryMaps(StreamType.MOVIE);

  return {
    info: {
      movie_image: xtreamSafeText(full.streamIcon),
      tmdb_id: metaText(meta.tmdbId),
      backdrop: metaText(meta.backdrop),
      youtube_trailer: metaText(meta.trailer),
      genre: metaText(meta.genre) || xtreamSafeText(full.category?.name),
      plot: metaText(meta.plot),
      cast: metaText(meta.cast),
      rating: metaText(meta.rating),
      director: metaText(meta.director),
      releasedate: metaText(meta.releaseDate ?? meta.releasedate),
      duration_secs: metaNumber(meta.durationSecs),
      duration: metaText(meta.duration),
      bitrate: metaNumber(meta.bitrate),
      video: meta.video && typeof meta.video === "object" && !Array.isArray(meta.video) ? meta.video : {},
      audio: meta.audio && typeof meta.audio === "object" && !Array.isArray(meta.audio) ? meta.audio : {},
    },
    movie_data: {
      stream_id: cuidToNum(full.id),
      name: xtreamSafeText(full.name) || "Movie",
      added: Math.floor(full.createdAt.getTime() / 1000).toString(),
      category_id: canonicalNumericForCategory(canonical, full.categoryId),
      container_extension: ext,
      custom_sid: "",
      direct_source: "",
    },
  };
}

/** Xtream get_series_info — groups episodes by seriesName (or single stream as one episode). */
export async function xtreamSeriesInfo(
  line: LineWithBouquets,
  _baseUrl: string,
  seriesIdParam: string
) {
  const streamId = await resolveStreamIdParam(seriesIdParam, { lineId: line.id });
  if (!streamId) return null;

  const seed = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { category: true },
  });
  if (!seed || seed.type !== StreamType.SERIES) return null;

  const seriesKey = seed.seriesName?.trim() || seed.name;
  let episodeIds = await seriesEpisodeIdsForLine(line.id, seed.id, seriesKey);
  if (!episodeIds.length) episodeIds = [seed.id];
  const fullRows = await prisma.stream.findMany({
    where: { id: { in: episodeIds } },
    include: { category: true },
  });
  const byId = new Map(fullRows.map((s) => [s.id, s]));
  const canonical = await buildCanonicalCategoryMaps(StreamType.SERIES);

  const seasons: Record<string, unknown[]> = {};
  for (const epId of episodeIds) {
    const ep = byId.get(epId);
    if (!ep) continue;
    const meta = parseMetaJson(ep.agentStartCmd);
    const seasonNum = metaNumber(meta.season ?? ep.seasonNum, 1) || 1;
    const key = String(seasonNum);
    if (!seasons[key]) seasons[key] = [];
    const ext = xtreamListingExtension(ep.containerExtension, "mkv", ep.streamUrl);
    seasons[key].push({
      id: cuidToNum(ep.id),
      stream_id: cuidToNum(ep.id),
      episode_num: metaNumber(meta.episode ?? ep.episodeNum, seasons[key].length + 1) || 1,
      title: xtreamSafeText(ep.name) || `Episode ${seasons[key].length + 1}`,
      container_extension: ext,
      info: {
        movie_image: xtreamSafeText(ep.streamIcon),
        plot: metaText(meta.plot),
        releasedate: metaText(meta.releaseDate),
        duration_secs: metaNumber(meta.durationSecs),
        duration: metaText(meta.duration),
        rating: metaText(meta.rating),
      },
      custom_sid: "",
      added: Math.floor(ep.createdAt.getTime() / 1000).toString(),
      season: seasonNum,
      direct_source: "",
    });
  }

  const meta = parseMetaJson(seed.agentStartCmd);
  const cover = xtreamSafeText(seed.streamIcon);
  return {
    seasons: Object.keys(seasons)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => ({ season_number: n, name: `Season ${n}`, cover })),
    info: {
      name: xtreamSafeText(seriesKey) || "Series",
      cover,
      plot: metaText(meta.plot),
      cast: metaText(meta.cast),
      director: metaText(meta.director),
      genre: metaText(meta.genre) || xtreamSafeText(seed.category?.name),
      releaseDate: metaText(meta.releaseDate),
      last_modified: Math.floor(seed.updatedAt.getTime() / 1000).toString(),
      rating: metaText(meta.rating) || "0",
      rating_5based: metaNumber(meta.rating_5based),
      backdrop_path: backdropPath(meta.backdrop),
      youtube_trailer: metaText(meta.trailer),
      episode_run_time: metaText(meta.duration) || "0",
      category_id: canonicalNumericForCategory(canonical, seed.categoryId),
    },
    episodes: seasons,
  };
}
