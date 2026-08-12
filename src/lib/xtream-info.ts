import type { LineWithBouquets } from "./lines";
import { streamsForLineExport } from "./lines";
import { exportPlaybackUrl } from "./export-playback-url";
import { StreamType } from "@prisma/client";
import { prisma } from "./prisma";
import { cuidToNum, resolveStreamIdParam } from "./xtream-stream-id";

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

  const streams = await streamsForLineExport(line);
  const movie = streams.find((s) => s.id === streamId && s.type === StreamType.MOVIE);
  if (!movie) return null;

  const full = await prisma.stream.findUnique({
    where: { id: streamId },
    include: { provider: true, category: true },
  });
  if (!full) return null;

  const meta = parseMetaJson(full.agentStartCmd);
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
      category_id: full.categoryId ?? "0",
      container_extension: ext,
      custom_sid: "",
      direct_source: exportPlaybackUrl(baseUrl, line, full, full),
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

  const streams = await streamsForLineExport(line);
  const seed = streams.find((s) => s.id === streamId && s.type === StreamType.SERIES);
  if (!seed) return null;

  const seriesKey = seed.seriesName?.trim() || seed.name;
  const episodes = streams.filter(
    (s) =>
      s.type === StreamType.SERIES &&
      (s.seriesName?.trim() === seriesKey || s.id === seed.id || s.name === seriesKey)
  );

  const fullRows = await prisma.stream.findMany({
    where: { id: { in: episodes.map((e) => e.id) } },
    include: { provider: true, category: true },
  });
  const byId = new Map(fullRows.map((s) => [s.id, s]));

  const seasons: Record<string, unknown[]> = {};
  for (const ep of episodes) {
    const full = byId.get(ep.id) ?? ep;
    const season = String(full.seasonNum && full.seasonNum > 0 ? full.seasonNum : 1);
    if (!seasons[season]) seasons[season] = [];
    const meta = parseMetaJson(full.agentStartCmd);
    const ext = full.containerExtension ?? "mkv";
    seasons[season].push({
      id: cuidToNum(full.id),
      episode_num: full.episodeNum ?? seasons[season].length + 1,
      title: full.name,
      container_extension: ext,
      info: {
        movie_image: full.streamIcon ?? "",
        plot: typeof meta.plot === "string" ? meta.plot : "",
        releasedate: meta.releaseDate ?? "",
        rating: meta.rating ?? "",
        duration_secs: meta.durationSecs ?? 0,
        duration: meta.duration ?? "",
      },
      custom_sid: "",
      added: Math.floor(full.createdAt.getTime() / 1000).toString(),
      season: Number(season),
      direct_source: exportPlaybackUrl(baseUrl, line, full, full),
    });
  }

  for (const key of Object.keys(seasons)) {
    seasons[key].sort((a, b) => {
      const ea = (a as { episode_num?: number }).episode_num ?? 0;
      const eb = (b as { episode_num?: number }).episode_num ?? 0;
      return ea - eb;
    });
  }

  const cover = seed.streamIcon ?? byId.get(seed.id)?.streamIcon ?? "";
  const seedMeta = parseMetaJson(byId.get(seed.id)?.agentStartCmd);

  return {
    seasons: Object.keys(seasons)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => ({ season_number: n, name: `Season ${n}`, cover, cover_big: cover })),
    info: {
      name: seriesKey,
      cover,
      plot: typeof seedMeta.plot === "string" ? seedMeta.plot : "",
      cast: seedMeta.cast ?? "",
      director: seedMeta.director ?? "",
      genre: seedMeta.genre ?? byId.get(seed.id)?.category?.name ?? "",
      releaseDate: seedMeta.releaseDate ?? "",
      last_modified: Math.floor(seed.updatedAt.getTime() / 1000).toString(),
      rating: seedMeta.rating ?? "",
      rating_5based: 0,
      backdrop_path: [] as string[],
      youtube_trailer: seedMeta.trailer ?? "",
      episode_run_time: seedMeta.duration ?? "",
      category_id: seed.categoryId ?? "0",
    },
    episodes: seasons,
  };
}
