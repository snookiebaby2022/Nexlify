"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TmdbSearch, type TmdbPick } from "@/components/tmdb-search";
import { FormField, formInputClass, formInputStyle } from "@/components/form-page-shell";
import { ExternalImage } from "@/components/external-image";
import type { VodTmdbFields } from "@/lib/vod-meta";

export type TmdbMetaFields = VodTmdbFields;

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
  defaultSearchQuery = "",
  title,
  embedded = false,
}: {
  mediaType: "movie" | "tv";
  meta: TmdbMetaFields;
  onChange: (patch: Partial<TmdbMetaFields>) => void;
  onPoster?: (url: string) => void;
  onTitle?: (title: string) => void;
  defaultSearchQuery?: string;
  title?: string;
  /** When true, skip outer card chrome (parent provides the section shell). */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);

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
          tmdbBackdrop: d.backdropUrl ?? meta.tmdbBackdrop,
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

  async function fetchFromTitle() {
    const query = defaultSearchQuery.trim();
    if (query.length < 2) return;
    setAutoBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tmdb/search?q=${encodeURIComponent(query)}&type=${mediaType}`
      );
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.results) || !data.results.length) return;
      await applyPick(data.results[0] as TmdbPick);
    } finally {
      setAutoBusy(false);
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

  const body = (
    <div className={embedded ? "space-y-4" : "p-4 space-y-4 border-t"} style={embedded ? undefined : { borderColor: "var(--border)" }}>
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={autoBusy || defaultSearchQuery.trim().length < 2}
          onClick={() => void fetchFromTitle()}
          className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {autoBusy ? "Fetching…" : "Fetch from TMDB"}
        </button>
        {defaultSearchQuery.trim() ? (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Match using: {defaultSearchQuery.trim()}
          </span>
        ) : null}
      </div>
      <div className="grid md:grid-cols-[140px_1fr] gap-4">
        <div className="space-y-2">
          {meta.tmdbPoster ? (
            <ExternalImage
              src={meta.tmdbPoster}
              alt=""
              width={140}
              height={210}
              className="w-full max-w-[140px] rounded border object-cover aspect-[2/3]"
              style={{ borderColor: "var(--border)" }}
            />
          ) : (
            <div
              className="w-full max-w-[140px] aspect-[2/3] rounded border flex items-center justify-center text-xs text-center px-2"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              No poster
            </div>
          )}
        </div>
        <div className="space-y-4 min-w-0">
          <TmdbSearch
            mediaType={mediaType}
            initialQuery={defaultSearchQuery}
            onSelect={(p) => void applyPick(p)}
          />
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
            {field("tmdbPoster", "Poster URL")}
            {field("tmdbBackdrop", "Backdrop URL")}
            {field("tmdbRelease", "Release date")}
            {field("tmdbRating", "Rating")}
            {field("tmdbTrailer", "Trailer URL")}
            {field("tmdbDirector", "Director")}
            {field(
              "tmdbRuntime",
              mediaType === "tv" ? "Episode run time (minutes)" : "Runtime (minutes)"
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) return body;

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
        {title ?? "TMDB"}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && body}
    </div>
  );
}
