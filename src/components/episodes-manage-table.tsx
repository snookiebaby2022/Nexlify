"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Search } from "lucide-react";

type Episode = {
  id: string;
  title: string;
  season: number;
  episode: number;
  streamUrl: string;
  series: { id: string; name: string };
};

export function EpisodesManageTable({ initialSeriesId }: { initialSeriesId?: string }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState(initialSeriesId ?? "");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function load() {
    const params = new URLSearchParams();
    if (seriesFilter) params.set("seriesId", seriesFilter);
    fetch(`/api/admin/episodes?${params}`)
      .then((r) => r.json())
      .then((d) => setEpisodes(d.episodes ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [seriesFilter]);

  const seriesOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ep of episodes) map.set(ep.series.id, ep.series.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [episodes]);

  const filtered = useMemo(() => {
    return episodes.filter((ep) => {
      const q = search.trim().toLowerCase();
      if (q && !ep.title.toLowerCase().includes(q) && !ep.series.name.toLowerCase().includes(q)) return false;
      if (seasonFilter && String(ep.season) !== seasonFilter) return false;
      return true;
    });
  }, [episodes, search, seasonFilter]);

  async function remove(id: string) {
    if (!confirm("Delete this episode?")) return;
    await fetch(`/api/admin/episodes?id=${id}`, { method: "DELETE" });
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
            {filtered.length} episode{filtered.length !== 1 ? "s" : ""} · seasons & series from your VOD library
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
        <select className="xui-lines-select" value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)}>
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

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
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
              <th className="xui-lines-th">Stream URL</th>
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
                  <Link href={`/admin/servers/streams?edit=${ep.series.id}`} className="xui-lines-username">
                    {ep.series.name}
                  </Link>
                </td>
                <td className="xui-lines-td">S{ep.season}</td>
                <td className="xui-lines-td">E{ep.episode}</td>
                <td className="xui-lines-td font-medium">{ep.title}</td>
                <td className="xui-lines-td text-xs max-w-[220px] truncate font-mono" style={{ color: "var(--muted)" }}>
                  {ep.streamUrl}
                </td>
                <td className="xui-lines-td xui-lines-td--actions">
                  <Link
                    href={`/admin/servers/streams?edit=${ep.id}`}
                    className="text-xs mr-2 underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Edit
                  </Link>
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
    </div>
  );
}
