"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, RefreshCw, Search, Tv } from "lucide-react";
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-page-sizes";

type SeriesRow = {
  id: string;
  name: string;
  episodeCount: number;
  streamIcon: string | null;
  isActive: boolean;
  categoryName: string | null;
};

export function ManageSeriesTable() {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/series")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed to load series (${r.status})`);
        setSeries(Array.isArray(d.series) ? d.series : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load series"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return series;
    return series.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.categoryName ?? "").toLowerCase().includes(q)
    );
  }, [series, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

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
            {pageRows.map((s) => (
              <tr key={s.id}>
                <td className="xui-lines-td">
                  <div className="flex items-center gap-2">
                    {s.streamIcon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.streamIcon} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <Tv size={16} style={{ color: "var(--muted)" }} />
                    )}
                    <span className="font-medium">{s.name}</span>
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
                      href={`/admin/servers/streams?edit=${s.id}`}
                      className="p-1.5 rounded hover:bg-white/10"
                      title="Edit series"
                    >
                      <Pencil size={14} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!pageRows.length && !loading ? (
              <tr>
                <td colSpan={5} className="xui-lines-td text-center" style={{ color: "var(--muted)" }}>
                  No TV series yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="xui-streams-footer">
        <span>
          Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0} to{" "}
          {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} series
        </span>
        <div className="xui-streams-pagination">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </button>
          <span className="xui-streams-page-num">{safePage}</span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
