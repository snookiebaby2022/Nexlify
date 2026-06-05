"use client";

import { useState } from "react";
import { ExternalImage } from "@/components/external-image";

export type TmdbPick = {
  id: number;
  title: string;
  year: string;
  overview: string;
  posterUrl: string | null;
};

export function TmdbSearch({
  mediaType = "movie",
  onSelect,
}: {
  mediaType?: "movie" | "tv";
  onSelect: (pick: TmdbPick) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TmdbPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function search() {
    if (q.trim().length < 2) return;
    setLoading(true);
    setErr("");
    const res = await fetch(
      `/api/admin/tmdb/search?q=${encodeURIComponent(q)}&type=${mediaType}`
    );
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "Search failed");
      setResults([]);
      return;
    }
    setResults(data.results ?? []);
  }

  return (
    <div
      className="rounded border p-3 space-y-3"
      style={{ borderColor: "var(--border)", background: "rgba(94,184,232,0.06)" }}
    >
      <p className="text-sm font-medium">TMDB search</p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2 bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
          placeholder={mediaType === "tv" ? "Search series…" : "Search movie…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
        />
        <button
          type="button"
          disabled={loading}
          onClick={search}
          className="rounded px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {loading ? "…" : "Search"}
        </button>
      </div>
      {err && <p className="text-xs" style={{ color: "var(--danger)" }}>{err}</p>}
      {results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto space-y-1 text-sm list-none m-0 p-0">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full text-left flex gap-2 p-2 rounded hover:opacity-90 cursor-pointer"
                style={{ background: "var(--bg-card)" }}
                onClick={() => onSelect(r)}
              >
                {r.posterUrl && (
                  <ExternalImage
                    src={r.posterUrl}
                    alt=""
                    width={40}
                    height={56}
                    className="w-10 h-14 object-cover rounded shrink-0"
                  />
                )}
                <span>
                  <span className="font-medium">
                    {r.title}
                    {r.year ? ` (${r.year})` : ""}
                  </span>
                  {r.overview && (
                    <span className="block text-xs line-clamp-2" style={{ color: "var(--muted)" }}>
                      {r.overview}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
