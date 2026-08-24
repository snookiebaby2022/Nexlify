/** VOD metadata stored on Stream.agentStartCmd.

Xtream get_vod_info / get_series_info (locked) JSON.parse the whole column and
read plot/cast/director/genre/rating/releaseDate/trailer/duration. Panel forms
used to write `NEXLIFY_VOD:{tmdbOverview…}` which is not valid JSON, so apps
always saw empty media info. New writes are plain JSON with both tmdb* (admin UI)
and Xtream aliases.
*/

export const VOD_META_PREFIX = "NEXLIFY_VOD:";

function asText(value: unknown): string {
  if (value == null || typeof value === "object") return "";
  return String(value).trim();
}

export function formatDurationSecs(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function minutesToDuration(minutes: unknown): { duration: string; durationSecs: number } {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return { duration: "", durationSecs: 0 };
  const durationSecs = Math.round(m * 60);
  return { duration: formatDurationSecs(durationSecs), durationSecs };
}

/** Parse NEXLIFY_VOD:…, raw JSON, or XUI movie_properties JSON. */
export function parseVodAgentCmd(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  let s = raw.trim();
  if (s.startsWith(VOD_META_PREFIX)) s = s.slice(VOD_META_PREFIX.length);
  try {
    const parsed = JSON.parse(s) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON */
  }
  return {};
}

export function withXtreamVodAliases(meta: Record<string, unknown>): Record<string, unknown> {
  const plot =
    asText(meta.plot) ||
    asText(meta.tmdbOverview) ||
    asText(meta.overview) ||
    asText(meta.description) ||
    asText(meta.summary);
  const cast = asText(meta.cast) || asText(meta.tmdbCast) || asText(meta.actors);
  const director = asText(meta.director) || asText(meta.tmdbDirector);
  const genre = asText(meta.genre) || asText(meta.tmdbGenres);
  const rating = asText(meta.rating) || asText(meta.tmdbRating);
  const releaseDate =
    asText(meta.releaseDate) || asText(meta.releasedate) || asText(meta.tmdbRelease);
  const trailer =
    asText(meta.trailer) || asText(meta.tmdbTrailer) || asText(meta.youtube_trailer);
  const fromRuntime = minutesToDuration(meta.tmdbRuntime ?? meta.runtimeMinutes ?? meta.runtime ?? meta.episode_run_time);
  const durationSecsRaw = Number(meta.durationSecs ?? meta.duration_secs);
  const durationSecs =
    Number.isFinite(durationSecsRaw) && durationSecsRaw > 0 ? durationSecsRaw : fromRuntime.durationSecs;
  const duration = asText(meta.duration) || fromRuntime.duration || formatDurationSecs(durationSecs);
  const ratingNum = Number(rating);
  const rating_5basedRaw = Number(meta.rating_5based);
  const rating_5based = Number.isFinite(rating_5basedRaw) && rating_5basedRaw > 0
    ? rating_5basedRaw
    : Number.isFinite(ratingNum)
      ? Math.round((ratingNum / 2) * 10) / 10
      : 0;
  const backdrop =
    asText(meta.backdrop) ||
    asText(meta.tmdbBackdrop) ||
    (Array.isArray(meta.backdrop_path) ? asText(meta.backdrop_path[0]) : asText(meta.backdrop_path));
  const tmdbId = asText(meta.tmdbId) || asText(meta.tmdb_id);

  return {
    ...meta,
    ...(tmdbId ? { tmdbId } : {}),
    plot,
    cast,
    director,
    genre,
    rating,
    releaseDate,
    releasedate: releaseDate,
    trailer,
    duration,
    durationSecs,
    duration_secs: durationSecs,
    rating_5based,
    ...(backdrop ? { backdrop } : {}),
  };
}

/** Plain JSON so locked xtream-info parseMetaJson can read plot/cast. */
export function encodeVodAgentCmd(meta: Record<string, unknown>): string {
  return JSON.stringify(withXtreamVodAliases(meta));
}

/** Read agentStartCmd for get_vod_info / get_series_info (legacy prefix + tmdb* aliases). */
export function parseXtreamVodMeta(raw: string | null | undefined): Record<string, unknown> {
  const parsed = parseVodAgentCmd(raw);
  if (!Object.keys(parsed).length) return {};
  return withXtreamVodAliases(parsed);
}

export type VodTmdbFields = {
  tmdbId: string;
  tmdbTitle: string;
  tmdbOverview: string;
  tmdbCast: string;
  tmdbGenres: string;
  tmdbPoster: string;
  tmdbBackdrop: string;
  tmdbRelease: string;
  tmdbRating: string;
  tmdbTrailer: string;
  tmdbDirector: string;
  tmdbRuntime: string;
};

export const emptyVodTmdbFields = (): VodTmdbFields => ({
  tmdbId: "",
  tmdbTitle: "",
  tmdbOverview: "",
  tmdbCast: "",
  tmdbGenres: "",
  tmdbPoster: "",
  tmdbBackdrop: "",
  tmdbRelease: "",
  tmdbRating: "",
  tmdbTrailer: "",
  tmdbDirector: "",
  tmdbRuntime: "",
});

/** Read TMDB panel fields from stored agentStartCmd (NEXLIFY_VOD prefix or plain JSON). */
export function readVodTmdbFields(raw: string | null | undefined): VodTmdbFields {
  const meta = parseVodAgentCmd(raw);
  const xt = withXtreamVodAliases(meta);
  return {
    tmdbId: asText(meta.tmdbId) || asText(meta.tmdb_id),
    tmdbTitle: asText(meta.tmdbTitle) || asText(meta.title),
    tmdbOverview:
      asText(meta.tmdbOverview) || asText(xt.plot) || asText(meta.overview) || asText(meta.summary),
    tmdbCast: asText(meta.tmdbCast) || asText(xt.cast) || asText(meta.actors),
    tmdbGenres: asText(meta.tmdbGenres) || asText(xt.genre),
    tmdbPoster: asText(meta.tmdbPoster),
    tmdbBackdrop:
      asText(meta.tmdbBackdrop) ||
      asText(meta.backdrop) ||
      (Array.isArray(meta.backdrop_path) ? asText(meta.backdrop_path[0]) : asText(meta.backdrop_path)),
    tmdbRelease:
      asText(meta.tmdbRelease) || asText(xt.releaseDate) || asText(meta.releasedate),
    tmdbRating: asText(meta.tmdbRating) || asText(xt.rating),
    tmdbTrailer: asText(meta.tmdbTrailer) || asText(xt.trailer),
    tmdbDirector: asText(meta.tmdbDirector) || asText(xt.director),
    tmdbRuntime: asText(meta.tmdbRuntime) || asText(xt.duration),
  };
}

/** Merge TMDB fields into existing VOD agentStartCmd without dropping transcode/server options. */
export function mergeVodTmdbFields(
  existing: string | null | undefined,
  fields: Partial<VodTmdbFields>
): string {
  const base = parseVodAgentCmd(existing);
  return encodeVodAgentCmd({
    ...base,
    ...fields,
    tmdbId: fields.tmdbId ?? base.tmdbId,
    tmdbTitle: fields.tmdbTitle ?? base.tmdbTitle,
    tmdbOverview: fields.tmdbOverview ?? base.tmdbOverview,
    tmdbCast: fields.tmdbCast ?? base.tmdbCast,
    tmdbGenres: fields.tmdbGenres ?? base.tmdbGenres,
    tmdbPoster: fields.tmdbPoster ?? base.tmdbPoster,
    tmdbBackdrop: fields.tmdbBackdrop ?? base.tmdbBackdrop,
    tmdbRelease: fields.tmdbRelease ?? base.tmdbRelease,
    tmdbRating: fields.tmdbRating ?? base.tmdbRating,
    tmdbTrailer: fields.tmdbTrailer ?? base.tmdbTrailer,
    tmdbDirector: fields.tmdbDirector ?? base.tmdbDirector,
    tmdbRuntime: fields.tmdbRuntime ?? base.tmdbRuntime,
  });
}

export function rewriteVodAgentCmdForXtream(raw: string | null | undefined): string | null {
  const parsed = parseVodAgentCmd(raw);
  if (!Object.keys(parsed).length) return null;
  const next = encodeVodAgentCmd(parsed);
  if (raw?.trim() === next) return null;
  return next;
}

export function vodAgentCmdNeedsXtreamRewrite(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  if (raw.startsWith(VOD_META_PREFIX)) return true;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const hasTmdb = Boolean(asText(parsed.tmdbOverview) || asText(parsed.tmdbCast));
    const hasPlot = Boolean(asText(parsed.plot));
    return hasTmdb && !hasPlot;
  } catch {
    return false;
  }
}

/** XUI `movie_properties` / series JSON blob → Xtream-ready agentStartCmd. */
export function encodeVodMetaFromXuiProperties(raw: unknown): string | null {
  if (raw == null || raw === "" || raw === 0) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    const parsed = parseVodAgentCmd(raw);
    obj = Object.keys(parsed).length ? parsed : null;
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return null;
  const mapped = withXtreamVodAliases({
    ...obj,
    plot: obj.plot ?? obj.description ?? obj.plot_outline,
    cast: obj.cast ?? obj.actors,
    tmdbId: obj.tmdbId ?? obj.tmdb_id,
    trailer: obj.trailer ?? obj.youtube_trailer,
    backdrop: Array.isArray(obj.backdrop_path) ? obj.backdrop_path[0] : obj.backdrop_path ?? obj.cover_big,
  });
  if (!asText(mapped.plot) && !asText(mapped.cast) && !asText(mapped.tmdbId) && !asText(mapped.genre)) {
    return null;
  }
  return encodeVodAgentCmd(mapped);
}
