import type { LineWithBouquets } from "./lines";
import { exportPlaybackUrl } from "./export-playback-url";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettingGroup } from "./panel-settings";
import {
  cuidToNum,
  lineHasStream,
  resolveStreamIdParam,
  seriesEpisodeIdsForLine,
  xtreamCategoryId,
} from "./xtream-stream-id";

export { cuidToNum, resolveStreamIdParam };

function parseMetaJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Xtream get_vod_info response for a movie on the line. */
export async function xtreamVodInfo(
  line: LineWithBouquets,
  baseUrl: string,
  streamIdParam: string
) {
  const streamId = await resolveStreamIdParam(streamIdParam, { lineId: line.id });
  if (!streamId) return null;
  if (!(await lineHasStream(line.id, streamId))) return null;

  const full = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { provider: true, category: true },
  });
  if (!full || full.type !== StreamType.MOVIE) return null;

  const meta = parseMetaJson(full.agentStartCmd);
  const streamSettings = await getSettingGroup("streams");
  const directPlay = streamSettings.vodDirectPlay !== false;
  const ext = full.containerExtension ?? "mp4";

  return {
    info: {
      movie_image: full.streamIcon ?? "",
      tmdb_id: meta.tmdbId ?? "",
      backdrop: meta.backdrop ?? "",
      youtube_trailer: meta.trailer ?? "",
      genre: meta.genre ?? full.category?.name ?? "",
      plot: typeof meta.plot === "string" ? meta.plot : "",
      cast: meta.cast ?? "",
      rating: meta.rating ?? "",
      director: meta.director ?? "",
      releasedate: meta.releaseDate ?? meta.releasedate ?? "",
      duration_secs: meta.durationSecs ?? 0,
      duration: meta.duration ?? "",
      bitrate: meta.bitrate ?? 0,
      video: meta.video ?? {},
      audio: meta.audio ?? {},
    },
    movie_data: {
      stream_id: cuidToNum(full.id),
      name: full.name,
      added: Math.floor(full.createdAt.getTime() / 1000).toString(),
      category_id: xtreamCategoryId(full.categoryId),
      container_extension: ext,
      custom_sid: "",
      direct_source: exportPlaybackUrl(baseUrl, line, full, full, undefined, "auto", directPlay),
    },
  };
}

/** Xtream get_series_info — groups episodes by seriesName (or single stream as one episode). */
export async function xtreamSeriesInfo(
  line: LineWithBouquets,
  baseUrl: string,
  seriesIdParam: string
) {
  const streamId = await resolveStreamIdParam(seriesIdParam, { lineId: line.id });
  if (!streamId) return null;
  if (!(await lineHasStream(line.id, streamId))) return null;

  const seed = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { category: true },
  });
  if (!seed || seed.type !== StreamType.SERIES) return null;

  const seriesKey = seed.seriesName?.trim() || seed.name;
  const episodeIds = await seriesEpisodeIdsForLine(line.id, seed.id, seriesKey);
  const fullRows = episodeIds.length
    ? await prisma.stream.findMany({
        where: { id: { in: episodeIds } },
        include: { provider: true, category: true },
      })
    : [];
  const byId = new Map(fullRows.map((s) => [s.id, s]));

  const streamSettings = await getSettingGroup("streams");
  const directPlay = streamSettings.vodDirectPlay !== false;
  const seasons: Record<string, unknown[]> = {};
  for (const epId of episodeIds) {
    const ep = byId.get(epId);
    if (!ep) continue;
    const meta = parseMetaJson(ep.agentStartCmd);
    const seasonNum = Number(meta.season ?? ep.seasonNum ?? 1) || 1;
    const key = String(seasonNum);
    if (!seasons[key]) seasons[key] = [];
    const ext = ep.containerExtension ?? "mkv";
    seasons[key].push({
      id: cuidToNum(ep.id),
      stream_id: cuidToNum(ep.id),
      episode_num: Number(meta.episode ?? ep.episodeNum ?? seasons[key].length + 1) || 1,
      title: ep.name,
      container_extension: ext,
      info: {
        movie_image: ep.streamIcon ?? "",
        plot: typeof meta.plot === "string" ? meta.plot : "",
        releasedate: meta.releaseDate ?? "",
        duration_secs: meta.durationSecs ?? 0,
        duration: meta.duration ?? "",
        rating: meta.rating ?? "",
      },
      custom_sid: "",
      added: Math.floor(ep.createdAt.getTime() / 1000).toString(),
      season: seasonNum,
      direct_source: exportPlaybackUrl(baseUrl, line, ep, ep, undefined, "auto", directPlay),
    });
  }

  const meta = parseMetaJson(seed.agentStartCmd);
  return {
    seasons: Object.keys(seasons)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => ({ season_number: n, name: `Season ${n}`, cover: seed.streamIcon ?? "" })),
    info: {
      name: seriesKey,
      cover: seed.streamIcon ?? "",
      plot: typeof meta.plot === "string" ? meta.plot : "",
      cast: meta.cast ?? "",
      director: meta.director ?? "",
      genre: meta.genre ?? seed.category?.name ?? "",
      releaseDate: meta.releaseDate ?? "",
      last_modified: Math.floor(seed.updatedAt.getTime() / 1000).toString(),
      rating: meta.rating ?? "",
      rating_5based: 0,
      backdrop_path: meta.backdrop ? [String(meta.backdrop)] : ([] as string[]),
      youtube_trailer: meta.trailer ?? "",
      episode_run_time: meta.duration ?? "",
      category_id: xtreamCategoryId(seed.categoryId),
    },
    episodes: seasons,
  };
}
