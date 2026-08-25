"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, RefreshCw, Search, Tv, Trash2, Power } from "lucide-react";
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-page-sizes";
import { displayStreamIcon } from "@/lib/plex-artwork";
import { StreamDisplayTitle } from "@/components/stream-display-title";
import { TmdbBackfillBanner } from "@/components/tmdb-backfill-banner";

type SeriesRow = {
  id: string;
  name: string;
  episodeCount: number;
  streamIcon: string | null;
  streamUrl?: string | null;
  isActive: boolean;
  categoryName: string | null;
};

export function ManageSeriesTable() {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cat = new URLSearchParams(window.location.search).get("categoryId");
    if (cat) setCategoryId(cat);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (searchDebounced) params.set("search", searchDebounced);
    if (categoryId) params.set("categoryId", categoryId);
    fetch(`/api/admin/series?${params}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed to load series (${r.status})`);
        setSeries(Array.isArray(d.series) ? d.series : []);
        setTotal(Number(d.total ?? d.series?.length ?? 0));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load series"))
      .finally(() => setLoading(false));
  }, [page, pageSize, searchDebounced, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(row: SeriesRow) {
    setBusyId(row.id);
    await fetch("/api/admin/series", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, isActive: !row.isActive }),
    });
    setBusyId(null);
    load();
  }

  async function removeSeries(row: SeriesRow) {
    if (!confirm(`Delete series “${row.name}” and all ${row.episodeCount} episode(s)?`)) return;
    setBusyId(row.id);
    await fetch(`/api/admin/series?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    setBusyId(null);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="xui-lines-header">
        <div>
          <h1 className="text-xl font-semibold">Manage Series</h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            TV series only — open a title to edit its episodes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/content/series/add" className="xui-lines-header-btn xui-lines-header-btn--primary">
            Add Series
          </Link>
          <Link href="/admin/import/series" className="xui-lines-header-btn xui-lines-header-btn--outline">
            Import
          </Link>
        </div>
      </div>

      <TmdbBackfillBanner />

      {error ? (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}{" "}
          <button type="button" className="underline" onClick={load}>
            Retry
          </button>
        </p>
      ) : null}

      <div className="xui-lines-toolbar flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input
            type="search"
            placeholder="Search series…"
            className="xui-lines-select w-full pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label className="text-xs flex items-center gap-2" style={{ color: "var(--muted)" }}>
          Show
          <select
            className="xui-lines-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {LIST_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          entries
        </label>
        <button type="button" className="xui-lines-toolbar-btn" onClick={load}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="xui-lines-table w-full">
          <thead>
            <tr>
              <th className="xui-lines-th">Series</th>
              <th className="xui-lines-th">Category</th>
              <th className="xui-lines-th">Episodes</th>
              <th className="xui-lines-th">Status</th>
              <th className="xui-lines-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id}>
                <td className="xui-lines-td">
                  <div className="flex items-center gap-2">
                    {displayStreamIcon(s) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={displayStreamIcon(s)!}
                        alt=""
                        className="h-12 w-8 rounded object-cover bg-black/20"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Tv size={16} style={{ color: "var(--muted)" }} />
                    )}
                    <StreamDisplayTitle name={s.name} streamUrl={s.streamUrl} className="font-medium" />
                  </div>
                </td>
                <td className="xui-lines-td">{s.categoryName ?? "—"}</td>
                <td className="xui-lines-td">{s.episodeCount}</td>
                <td className="xui-lines-td">{s.isActive ? "Active" : "Disabled"}</td>
                <td className="xui-lines-td">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/content/episodes?seriesId=${encodeURIComponent(s.id)}`}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                    >
                      Edit episodes
                    </Link>
                    <Link
                      href={`/admin/content/episodes/add?seriesId=${encodeURIComponent(s.id)}`}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Add episode
                    </Link>
                    <Link
                      href={`/admin/servers/streams?edit=${s.id}`}
                      className="p-1.5 rounded hover:bg-white/10"
                      title="Edit series"
                    >
                      <Pencil size={14} />
                    </Link>
                    <button
                      type="button"
                      className="p-1.5 rounded hover:bg-white/10 disabled:opacity-50"
                      title={s.isActive ? "Disable" : "Enable"}
                      disabled={busyId === s.id}
                      onClick={() => void toggleActive(s)}
                    >
                      <Power size={14} style={{ color: s.isActive ? "var(--success)" : "var(--muted)" }} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded hover:bg-white/10 disabled:opacity-50"
                      title="Delete series"
                      disabled={busyId === s.id}
                      onClick={() => void removeSeries(s)}
                    >
                      <Trash2 size={14} style={{ color: "var(--danger)" }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!series.length && !loading ? (
              <tr>
                <td colSpan={5} className="xui-lines-td text-center" style={{ color: "var(--muted)" }}>
                  No TV series yet.
                </td>
              </tr>
            ) : null}
            {loading ? (
              <tr>
                <td colSpan={5} className="xui-lines-td text-center" style={{ color: "var(--muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="xui-streams-footer">
        <span>
          Showing {from} to {to} of {total} series
        </span>
        <div className="xui-streams-pagination">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </button>
          <span className="xui-streams-page-num">{safePage}</span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
