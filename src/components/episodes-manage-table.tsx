"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Search } from "lucide-react";
import { StreamDisplayTitle, streamDisplayName } from "@/components/stream-display-title";
import { IntegrationSourceBadge } from "@/components/stream-display-title";

type Episode = {
  id: string;
  title: string;
  season: number;
  episode: number;
  streamUrl: string;
  isActive?: boolean;
  hostedExternally?: boolean;
  series: { id: string; name: string };
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

export function EpisodesManageTable({ initialSeriesId }: { initialSeriesId?: string }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState(initialSeriesId ?? "");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seriesCatalog, setSeriesCatalog] = useState<{ id: string; name: string }[]>([]);

  function load() {
    const params = new URLSearchParams();
    if (seriesFilter) params.set("seriesId", seriesFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    fetch(`/api/admin/episodes?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setEpisodes(d.episodes ?? []);
        setTotal(Number(d.total ?? d.episodes?.length ?? 0));
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [seriesFilter, page, pageSize]);

  useEffect(() => {
    fetch("/api/admin/series")
      .then((r) => r.json())
      .then((d) => setSeriesCatalog(Array.isArray(d.series) ? d.series : []))
      .catch(() => {});
  }, []);

  const seriesOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seriesCatalog) map.set(s.id, s.name);
    for (const ep of episodes) map.set(ep.series.id, ep.series.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [episodes, seriesCatalog]);

  const filtered = useMemo(() => {
    return episodes.filter((ep) => {
      const q = search.trim().toLowerCase();
      if (q && !ep.title.toLowerCase().includes(q) && !ep.series.name.toLowerCase().includes(q)) return false;
      if (seasonFilter && String(ep.season) !== seasonFilter) return false;
      return true;
    });
  }, [episodes, search, seasonFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function remove(id: string) {
    if (!confirm("Delete this episode?")) return;
    await fetch(`/api/admin/episodes?id=${id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(ep: Episode) {
    await fetch("/api/admin/episodes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ep.id, isActive: !(ep.isActive !== false) }),
    });
    load();
  }

  async function bulkDelete() {
    if (!selected.size || !confirm(`Delete ${selected.size} episode(s)?`)) return;
    await Promise.all(Array.from(selected).map((id) => fetch(`/api/admin/episodes?id=${id}`, { method: "DELETE" })));
    setSelected(new Set());
    load();
  }

  return (
    <div className="space-y-4">
      <div className="xui-lines-header">
        <div>
          <h1 className="text-xl font-semibold">Manage Episodes</h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            {total} episode{total !== 1 ? "s" : ""} · showing {filtered.length} on this page
          </p>
        </div>
        <Link href="/admin/content/episodes/add" className="xui-lines-header-btn xui-lines-header-btn--primary">
          <Plus size={14} className="inline mr-1" />
          Add Episode
        </Link>
      </div>

      <div className="xui-lines-toolbar flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input
            type="search"
            placeholder="Search title or series…"
            className="xui-lines-select w-full pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          entries
        </label>
        <select
          className="xui-lines-select"
          value={seriesFilter}
          onChange={(e) => {
            setSeriesFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All series</option>
          {seriesOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          placeholder="Season"
          className="xui-lines-select w-24"
          value={seasonFilter}
          onChange={(e) => setSeasonFilter(e.target.value)}
        />
        <button type="button" className="xui-lines-toolbar-btn" onClick={load}>
          <RefreshCw size={14} />
        </button>
        <button type="button" className="xui-lines-toolbar-btn" disabled={!selected.size} onClick={bulkDelete}>
          Delete selected
        </button>
      </div>

      <div className="md:hidden divide-y rounded-lg border" style={{ borderColor: "var(--border)" }}>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            No episodes yet.
          </p>
        ) : (
          filtered.map((ep) => (
            <article key={ep.id} className="panel-mobile-card p-4 space-y-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(ep.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(ep.id)) next.delete(ep.id);
                    else next.add(ep.id);
                    setSelected(next);
                  }}
                  aria-label={`Select episode ${ep.title}`}
                />
                <div className="min-w-0 flex-1">
                  <StreamDisplayTitle name={ep.title} streamUrl={ep.streamUrl} className="font-medium" />
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    {streamDisplayName(ep.series.name, ep.streamUrl)} · S{ep.season} E{ep.episode} ·{" "}
                    {ep.isActive === false ? "Disabled" : "Active"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-7">
                <Link
                  href={`/admin/servers/streams?edit=${ep.id}`}
                  className="panel-mobile-card-action text-xs px-3 py-2 rounded border"
                  style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                >
                  Edit
                </Link>
                <button
                  type="button"
                  className="panel-mobile-card-action text-xs px-3 py-2 rounded border"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => void toggleActive(ep)}
                >
                  {ep.isActive === false ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  className="panel-mobile-card-action text-xs px-3 py-2 rounded border"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                  onClick={() => remove(ep.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="xui-lines-table w-full">
          <thead>
            <tr>
              <th className="xui-lines-th xui-lines-td--check">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={() => {
                    if (selected.size === filtered.length) setSelected(new Set());
                    else setSelected(new Set(filtered.map((e) => e.id)));
                  }}
                />
              </th>
              <th className="xui-lines-th">Series</th>
              <th className="xui-lines-th">Season</th>
              <th className="xui-lines-th">Ep</th>
              <th className="xui-lines-th">Title</th>
              <th className="xui-lines-th">Source</th>
              <th className="xui-lines-th">Status</th>
              <th className="xui-lines-th xui-lines-td--actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ep, i) => (
              <tr key={ep.id} className={i % 2 === 0 ? "xui-lines-row--even" : "xui-lines-row--odd"}>
                <td className="xui-lines-td xui-lines-td--check">
                  <input
                    type="checkbox"
                    checked={selected.has(ep.id)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(ep.id)) next.delete(ep.id);
                      else next.add(ep.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td className="xui-lines-td">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/servers/streams?edit=${ep.series.id}`} className="xui-lines-username">
                      {streamDisplayName(ep.series.name, ep.streamUrl)}
                    </Link>
                    <IntegrationSourceBadge streamUrl={ep.streamUrl} />
                  </span>
                </td>
                <td className="xui-lines-td">S{ep.season}</td>
                <td className="xui-lines-td">E{ep.episode}</td>
                <td className="xui-lines-td font-medium">
                  <StreamDisplayTitle name={ep.title} streamUrl={ep.streamUrl} />
                </td>
                <td className="xui-lines-td text-xs max-w-[220px] truncate font-mono" style={{ color: "var(--muted)" }}>
                  {ep.hostedExternally ? (
                    <span className="xui-uptime-badge xui-uptime-badge--direct mr-1">PROVIDER</span>
                  ) : null}
                  {ep.streamUrl}
                </td>
                <td className="xui-lines-td">{ep.isActive === false ? "Disabled" : "Active"}</td>
                <td className="xui-lines-td xui-lines-td--actions">
                  <Link
                    href={`/admin/servers/streams?edit=${ep.id}`}
                    className="text-xs mr-2 underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="text-xs mr-2 underline"
                    style={{ color: "var(--muted)" }}
                    onClick={() => void toggleActive(ep)}
                  >
                    {ep.isActive === false ? "Enable" : "Disable"}
                  </button>
                  <button type="button" className="text-xs mr-2" style={{ color: "var(--danger)" }} onClick={() => remove(ep.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-6 text-sm text-center" style={{ color: "var(--muted)" }}>
            No episodes yet.{" "}
            <Link href="/admin/content/episodes/add" className="underline" style={{ color: "var(--accent)" }}>
              Add one
            </Link>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
