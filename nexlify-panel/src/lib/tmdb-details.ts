import { getSettingGroup } from "@/lib/panel-settings";

export type TmdbDetails = {
  id: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  release: string;
  rating: string;
  genres: string;
  cast: string;
  director: string;
  trailer: string;
  runtimeMinutes: string;
};

async function tmdbFetch(path: string) {
  const settings = await getSettingGroup("tmdb");
  const apiKey = String(settings.apiKey ?? "").trim();
  if (!apiKey) throw new Error("TMDB API key not configured (Settings → TMDB)");
  const language = String(settings.language ?? "en-US");
  const url = `https://api.themoviedb.org/3/${path}${path.includes("?") ? "&" : "?"}api_key=${apiKey}&language=${language}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

export async function fetchTmdbDetails(
  id: number,
  mediaType: "movie" | "tv"
): Promise<TmdbDetails> {
  const base = await tmdbFetch(`${mediaType}/${id}?append_to_response=credits,videos`);
  const credits = base.credits as {
    cast?: { name: string }[];
    crew?: { name: string; job: string }[];
  } | undefined;
  const videos = base.videos as { results?: { site: string; type: string; key: string }[] } | undefined;

  const cast = (credits?.cast ?? [])
    .slice(0, 12)
    .map((c) => c.name)
    .join(", ");
  const director =
    (credits?.crew ?? []).find((c) => c.job === "Director")?.name ??
    (credits?.crew ?? []).find((c) => c.job === "Creator")?.name ??
    "";

  const yt = (videos?.results ?? []).find((v) => v.site === "YouTube" && v.type === "Trailer");
  const trailer = yt ? `https://www.youtube.com/watch?v=${yt.key}` : "";

  const title = base.title ?? base.name ?? "Unknown";
  const release = (base.release_date ?? base.first_air_date ?? "").slice(0, 10);
  const rating =
    base.vote_average != null ? String(Number(base.vote_average).toFixed(1)) : "";
  const genres = (base.genres as { name: string }[] | undefined)?.map((g) => g.name).join(", ") ?? "";
  const runtime =
    mediaType === "movie"
      ? base.runtime != null
        ? String(base.runtime)
        : ""
      : base.episode_run_time?.[0] != null
        ? String(base.episode_run_time[0])
        : "";

  return {
    id,
    title,
    overview: base.overview ?? "",
    posterUrl: base.poster_path ? `https://image.tmdb.org/t/p/w500${base.poster_path}` : null,
    release,
    rating,
    genres,
    cast,
    director,
    trailer,
    runtimeMinutes: runtime,
  };
}
