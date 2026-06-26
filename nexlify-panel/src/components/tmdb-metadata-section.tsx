"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TmdbSearch, type TmdbPick } from "@/components/tmdb-search";
import { FormField, formInputClass, formInputStyle } from "@/components/form-page-shell";

export type TmdbMetaFields = {
  tmdbId: string;
  tmdbTitle: string;
  tmdbOverview: string;
  tmdbCast: string;
  tmdbGenres: string;
  tmdbPoster: string;
  tmdbRelease: string;
  tmdbRating: string;
  tmdbTrailer: string;
  tmdbDirector: string;
  tmdbRuntime: string;
};

export const emptyTmdbMeta = (): TmdbMetaFields => ({
  tmdbId: "",
  tmdbTitle: "",
  tmdbOverview: "",
  tmdbCast: "",
  tmdbGenres: "",
  tmdbPoster: "",
  tmdbRelease: "",
  tmdbRating: "",
  tmdbTrailer: "",
  tmdbDirector: "",
  tmdbRuntime: "",
});

export function TmdbMetadataSection({
  mediaType,
  meta,
  onChange,
  onPoster,
  onTitle,
}: {
  mediaType: "movie" | "tv";
  meta: TmdbMetaFields;
  onChange: (patch: Partial<TmdbMetaFields>) => void;
  onPoster?: (url: string) => void;
  onTitle?: (title: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  async function applyPick(pick: TmdbPick) {
    setLoading(true);
    onTitle?.(pick.title + (pick.year ? ` (${pick.year})` : ""));
    onPoster?.(pick.posterUrl ?? "");
    onChange({
      tmdbId: String(pick.id),
      tmdbTitle: pick.title,
      tmdbOverview: pick.overview ?? "",
      tmdbPoster: pick.posterUrl ?? "",
    });
    try {
      const res = await fetch(
        `/api/admin/tmdb/detail?id=${pick.id}&type=${mediaType}`
      );
      const data = await res.json();
      if (res.ok && data.details) {
        const d = data.details;
        onChange({
          tmdbId: String(d.id),
          tmdbTitle: d.title,
          tmdbOverview: d.overview,
          tmdbCast: d.cast,
          tmdbGenres: d.genres,
          tmdbPoster: d.posterUrl ?? meta.tmdbPoster,
          tmdbRelease: d.release,
          tmdbRating: d.rating,
          tmdbTrailer: d.trailer,
          tmdbDirector: d.director,
          tmdbRuntime: d.runtimeMinutes,
        });
        if (d.posterUrl) onPoster?.(d.posterUrl);
        onTitle?.(d.title);
      }
    } finally {
      setLoading(false);
    }
  }

  const field = (key: keyof TmdbMetaFields, label: string, multiline?: boolean) => (
    <FormField label={label}>
      {multiline ? (
        <textarea
          className={formInputClass}
          style={formInputStyle}
          rows={3}
          value={meta[key]}
          onChange={(e) => onChange({ [key]: e.target.value })}
        />
      ) : (
        <input
          className={formInputClass}
          style={formInputStyle}
          value={meta[key]}
          onChange={(e) => onChange({ [key]: e.target.value })}
        />
      )}
    </FormField>
  );

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold cursor-pointer"
        style={{ background: "rgba(94,184,232,0.12)", color: "#00c0ef" }}
        onClick={() => setOpen((o) => !o)}
      >
        TMDB
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="p-4 space-y-4 border-t" style={{ borderColor: "var(--border)" }}>
          <TmdbSearch mediaType={mediaType} onSelect={(p) => void applyPick(p)} />
          {loading && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Loading metadata from TMDB…
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {field("tmdbId", "TMDB ID")}
            {field("tmdbTitle", "Title")}
            <div className="md:col-span-2">{field("tmdbOverview", "Overview", true)}</div>
            {field("tmdbCast", "Actors", true)}
            {field("tmdbGenres", "Genres")}
            {field("tmdbPoster", "Poster")}
            {field("tmdbRelease", "Release")}
            {field("tmdbRating", "Rating")}
            {field("tmdbTrailer", "Trailer")}
            {field("tmdbDirector", "Director")}
            {field(
              "tmdbRuntime",
              mediaType === "tv" ? "Episode run time (in minutes)" : "Runtime (minutes)"
            )}
          </div>
        </div>
      )}
    </div>
  );
}
