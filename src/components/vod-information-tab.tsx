"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { TmdbSearch, type TmdbPick } from "@/components/tmdb-search";
import { formInputClass, formInputStyle } from "@/components/form-page-shell";
import type { VodTmdbFields } from "@/lib/vod-meta";

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="xui-vod-info-row">
      <div className="xui-vod-info-label">{label}</div>
      <div className="xui-vod-info-field">{children}</div>
    </div>
  );
}

function UrlField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="flex gap-2 items-start w-full">
      <input
        className={`${formInputClass} flex-1 font-mono text-xs`}
        style={formInputStyle}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        title="Preview image"
        disabled={!value.trim()}
        onClick={() => setPreview((p) => !p)}
        className="xui-vod-info-preview-btn shrink-0"
      >
        <Eye size={16} />
      </button>
      {preview && value.trim() ? (
        <div className="xui-vod-info-preview-pop">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.trim()} alt="" />
        </div>
      ) : null}
    </div>
  );
}

/** XUI-style Information tab: Poster, Backdrop, Plot, cast, TMDB search. */
export function VodInformationTab({
  mediaType,
  meta,
  onChange,
  defaultSearchQuery,
  onPoster,
}: {
  mediaType: "movie" | "tv";
  meta: VodTmdbFields;
  onChange: (patch: Partial<VodTmdbFields>) => void;
  defaultSearchQuery: string;
  onPoster?: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);

  async function applyPick(pick: TmdbPick) {
    setLoading(true);
    onChange({
      tmdbId: String(pick.id),
      tmdbTitle: pick.title,
      tmdbOverview: pick.overview ?? "",
      tmdbPoster: pick.posterUrl ?? meta.tmdbPoster,
    });
    if (pick.posterUrl) onPoster?.(pick.posterUrl);
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
      if (res.ok && Array.isArray(data.results) && data.results.length) {
        await applyPick(data.results[0] as TmdbPick);
      }
    } finally {
      setAutoBusy(false);
    }
  }

  const set = (key: keyof VodTmdbFields, value: string) => onChange({ [key]: value });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center pb-2 border-b" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          disabled={autoBusy || defaultSearchQuery.trim().length < 2}
          onClick={() => void fetchFromTitle()}
          className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {autoBusy ? "Fetching…" : "Fetch from TMDB"}
        </button>
        {loading ? (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Loading TMDB details…
          </span>
        ) : null}
      </div>

      <TmdbSearch
        mediaType={mediaType}
        initialQuery={defaultSearchQuery}
        onSelect={(p) => void applyPick(p)}
      />

      <div className="xui-vod-info-form">
        <InfoRow label="Poster URL">
          <UrlField
            value={meta.tmdbPoster}
            onChange={(v) => {
              set("tmdbPoster", v);
              onPoster?.(v);
            }}
            placeholder="https://image.tmdb.org/t/p/w500/…"
          />
        </InfoRow>
        <InfoRow label="Backdrop URL">
          <UrlField
            value={meta.tmdbBackdrop}
            onChange={(v) => set("tmdbBackdrop", v)}
            placeholder="https://image.tmdb.org/t/p/w1280/…"
          />
        </InfoRow>
        <InfoRow label="Plot">
          <textarea
            className={formInputClass}
            style={formInputStyle}
            rows={5}
            value={meta.tmdbOverview}
            onChange={(e) => set("tmdbOverview", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="Cast">
          <textarea
            className={formInputClass}
            style={formInputStyle}
            rows={3}
            value={meta.tmdbCast}
            onChange={(e) => set("tmdbCast", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="Director">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={meta.tmdbDirector}
            onChange={(e) => set("tmdbDirector", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="Genres">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={meta.tmdbGenres}
            onChange={(e) => set("tmdbGenres", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="Release date">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={meta.tmdbRelease}
            onChange={(e) => set("tmdbRelease", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="Rating">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={meta.tmdbRating}
            onChange={(e) => set("tmdbRating", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="Runtime (minutes)">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={meta.tmdbRuntime}
            onChange={(e) => set("tmdbRuntime", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="Trailer URL">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={meta.tmdbTrailer}
            onChange={(e) => set("tmdbTrailer", e.target.value)}
          />
        </InfoRow>
        <InfoRow label="TMDB ID">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={meta.tmdbId}
            onChange={(e) => set("tmdbId", e.target.value)}
          />
        </InfoRow>
      </div>
    </div>
  );
}
