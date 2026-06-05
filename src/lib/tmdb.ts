import { getSettingGroup } from "@/lib/panel-settings";

export type TmdbSearchResult = {
  id: number;
  title: string;
  year: string;
  overview: string;
  posterUrl: string | null;
  mediaType: "movie" | "tv";
};

export async function searchTmdb(
  query: string,
  mediaType: "movie" | "tv" = "movie"
): Promise<TmdbSearchResult[]> {
  const settings = await getSettingGroup("tmdb");
  const apiKey = String(settings.apiKey ?? "").trim();
  if (!apiKey) {
    throw new Error("TMDB API key not configured (Settings → TMDB)");
  }

  const language = String(settings.language ?? "en-US");
  const q = encodeURIComponent(query.trim());
  if (!q) return [];

  const path = mediaType === "tv" ? "search/tv" : "search/movie";
  const url = `https://api.themoviedb.org/3/${path}?api_key=${apiKey}&language=${language}&query=${q}&include_adult=false`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TMDB error ${res.status}: ${err.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    results?: {
      id: number;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      overview?: string;
      poster_path?: string | null;
    }[];
  };

  return (data.results ?? []).slice(0, 20).map((r) => ({
    id: r.id,
    title: r.title ?? r.name ?? "Unknown",
    year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
    overview: r.overview ?? "",
    posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
    mediaType,
  }));
}
