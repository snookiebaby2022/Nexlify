import { getSettingGroup } from "./panel-settings";
import { searchTmdb } from "./tmdb";
import { fetchTmdbDetails } from "./tmdb-details";
import { encodeVodAgentCmd } from "./vod-meta";
import { cleanTitleForTmdb } from "./vod-title-clean";

export { cleanTitleForTmdb } from "./vod-title-clean";

export type VodEnrichment = {
  streamIcon: string | null;
  agentStartCmd: string;
  genreNames: string[];
  title?: string;
};

const tmdbCache = new Map<string, VodEnrichment | null>();

function encodeImportedVodMeta(tmdb: {
  id: number;
  title: string;
  overview: string;
  cast: string;
  genres: string;
  posterUrl: string | null;
  release: string;
  rating: string;
  trailer: string;
  director: string;
  runtimeMinutes: string;
  backdropUrl?: string | null;
}): string {
  return encodeVodAgentCmd({
    v: 1,
    location: "local",
    doNotEncode: false,
    symlinkSource: false,
    directSource: true,
    removeSubtitles: false,
    nativeFrames: false,
    isAdult: false,
    outputFormats: "mp4",
    customMap: "",
    userAgent: "",
    proxy: "",
    headers: [""],
    serverIds: [] as string[],
    transcodeProfile: "none",
    bouquetIds: [] as string[],
    tmdbId: String(tmdb.id),
    tmdbTitle: tmdb.title,
    tmdbOverview: tmdb.overview,
    tmdbCast: tmdb.cast,
    tmdbGenres: tmdb.genres,
    tmdbPoster: tmdb.posterUrl ?? "",
    tmdbBackdrop: tmdb.backdropUrl ?? "",
    tmdbRelease: tmdb.release,
    tmdbRating: tmdb.rating,
    tmdbTrailer: tmdb.trailer,
    tmdbDirector: tmdb.director,
    tmdbRuntime: tmdb.runtimeMinutes,
  });
}

export async function isTmdbConfigured(): Promise<boolean> {
  const settings = await getSettingGroup("tmdb");
  return Boolean(String(settings.apiKey ?? "").trim());
}

/** Lookup TMDB metadata for a movie or series episode (uses series name for TV). */
export async function enrichVodFromTmdb(
  name: string,
  type: "MOVIE" | "SERIES",
  seriesName?: string | null
): Promise<VodEnrichment | null> {
  if (!(await isTmdbConfigured())) return null;

  const mediaType = type === "SERIES" ? "tv" : "movie";
  const query =
    type === "SERIES" && seriesName?.trim()
      ? cleanTitleForTmdb(seriesName)
      : cleanTitleForTmdb(name);
  if (!query || query.length < 2) return null;

  const cacheKey = `${mediaType}:${query.toLowerCase()}`;
  if (tmdbCache.has(cacheKey)) return tmdbCache.get(cacheKey) ?? null;

  try {
    const results = await searchTmdb(query, mediaType);
    const hit = results[0];
    if (!hit) {
      tmdbCache.set(cacheKey, null);
      return null;
    }
    const details = await fetchTmdbDetails(hit.id, mediaType);
    const genreNames = details.genres
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);

    const enrichment: VodEnrichment = {
      streamIcon: details.posterUrl,
      agentStartCmd: encodeImportedVodMeta(details),
      genreNames,
      title: details.title,
    };
    tmdbCache.set(cacheKey, enrichment);
    return enrichment;
  } catch {
    // Do not cache failures — a transient 429/timeout must not blank future lookups.
    return null;
  }
}

export function clearTmdbImportCache(): void {
  tmdbCache.clear();
}
