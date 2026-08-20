"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProgressBar, useProgress } from "@/components/progress-bar";
import { CategorySelect } from "@/components/category-select";
import { categoryTypeForStream, type CategoryOptionInput } from "@/lib/category-options";

const PAGE_SIZES = [25, 50, 100, 250, 500] as const;

type Stream = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isAdult?: boolean;
  seriesName?: string | null;
  seasonNum?: number | null;
  episodeNum?: number | null;
  vodMode?: string;
  containerExtension?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  server?: { id: string; name: string } | null;
};

type BouquetOption = { id: string; name: string };
type ServerOption = { id: string; name: string };

export function StreamsMassEdit({
  title,
  description,
  typeFilter,
  episodesOnly,
  seriesSeedsOnly,
  radioOnly,
}: {
  title: string;
  description: string;
  typeFilter?: "LIVE" | "MOVIE" | "SERIES";
  episodesOnly?: boolean;
  seriesSeedsOnly?: boolean;
  radioOnly?: boolean;
}) {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<CategoryOptionInput[]>([]);
  const [bouquets, setBouquets] = useState<BouquetOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [action, setAction] = useState("disable");
  const [categoryId, setCategoryId] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterBouquetId, setFilterBouquetId] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [minSpeed, setMinSpeed] = useState("");
  const [maxSpeed, setMaxSpeed] = useState("");
  const [clearSpeed, setClearSpeed] = useState(false);
  const [vodMode, setVodMode] = useState("LIVE");
  const [archiveDays, setArchiveDays] = useState("");
  const [backupUrl, setBackupUrl] = useState("");
  const [bouquetId, setBouquetId] = useState("");
  const [serverId, setServerId] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [containerExtension, setContainerExtension] = useState("mp4");
  const [seriesName, setSeriesName] = useState("");
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [selectingAll, setSelectingAll] = useState(false);
  const progress = useProgress();

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(
    (p: number, size: number) => {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(size),
        lite: "1",
      });
      if (typeFilter) params.set("type", typeFilter);
      if (radioOnly) params.set("radio", "1");
      if (episodesOnly) params.set("episodesOnly", "1");
      if (seriesSeedsOnly) params.set("seriesSeedsOnly", "1");
      if (filterCategoryId) params.set("categoryId", filterCategoryId);
      if (filterBouquetId) params.set("bouquetId", filterBouquetId);
      if (filterStatus === "active") params.set("status", "active");
      if (filterStatus === "inactive") params.set("status", "inactive");
      if (searchDebounced) params.set("search", searchDebounced);
      return params;
    },
    [typeFilter, radioOnly, episodesOnly, seriesSeedsOnly, filterCategoryId, filterBouquetId, filterStatus, searchDebounced]
  );

  const loadStreams = useCallback(() => {
    fetch(`/api/admin/streams?${buildParams(page, pageSize)}`)
      .then((r) => r.json())
      .then((d) => {
        setStreams(d.streams ?? []);
        setTotal(d.total ?? d.streams?.length ?? 0);
      });
  }, [buildParams, page, pageSize]);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets((d.bouquets ?? []).map((b: BouquetOption) => ({ id: b.id, name: b.name }))));
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers((d.servers ?? []).map((s: ServerOption) => ({ id: s.id, name: s.name }))));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allOnPageSelected = streams.length > 0 && streams.every((s) => selected.has(s.id));
  const isVod = typeFilter === "MOVIE" || typeFilter === "SERIES";

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  function toggleAll() {
    const n = new Set(selected);
    if (allOnPageSelected) streams.forEach((s) => n.delete(s.id));
    else streams.forEach((s) => n.add(s.id));
    setSelected(n);
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    setMsg("");
    try {
      const allIds: string[] = [];
      let p = 1;
      const batch = 500;
      while (true) {
        const res = await fetch(`/api/admin/streams?${buildParams(p, batch)}`);
        const d = await res.json();
        const list: Stream[] = d.streams ?? [];
        allIds.push(...list.map((s) => s.id));
        const t = d.total ?? list.length;
        if (p * batch >= t || list.length < batch) break;
        p++;
      }
      setSelected(new Set(allIds));
      setMsg(`Selected ${allIds.length} matching items`);
    } finally {
      setSelectingAll(false);
    }
  }

  async function apply() {
    if (!selected.size) return;
    if (action === "delete" && !confirm(`Delete ${selected.size} items?`)) return;

    if (action === "setCategory" && !categoryId) {
      setMsg("Choose a category");
      return;
    }
    if (action === "setSpeed") {
      const min = minSpeed.trim() === "" ? (clearSpeed ? null : undefined) : Number(minSpeed);
      const max = maxSpeed.trim() === "" ? (clearSpeed ? null : undefined) : Number(maxSpeed);
      if (min === undefined && max === undefined) {
        setMsg("Enter min and/or max speed (Kbps), or check “Clear limits”");
        return;
      }
      if (
        (typeof min === "number" && typeof max === "number" && min > max) ||
        (typeof min === "number" && Number.isNaN(min)) ||
        (typeof max === "number" && Number.isNaN(max))
      ) {
        setMsg("Invalid speed values — min must be ≤ max");
        return;
      }
    }
    if (action === "setBackupUrl" && !backupUrl.trim()) {
      setMsg("Enter a backup URL");
      return;
    }
    if ((action === "addToBouquet" || action === "removeFromBouquet") && !bouquetId) {
      setMsg("Choose a bouquet");
      return;
    }
    if (action === "setSeriesName" && !seriesName.trim()) {
      setMsg("Enter a series name");
      return;
    }

    setMsg("");
    progress.start(selected.size, `Processing ${action}…`);

    const res = await fetch("/api/admin/streams/mass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [...selected],
        action,
        categoryId:
          action === "setCategory" ? categoryId || null : undefined,
        bouquetIds: action === "addToBouquet" || action === "removeFromBouquet" ? [bouquetId] : undefined,
        serverId: action === "setServer" ? serverId || null : undefined,
        isAdult: action === "setAdult" ? isAdult : undefined,
        containerExtension: action === "setContainerExtension" ? containerExtension : undefined,
        seriesName: action === "setSeriesName" ? seriesName.trim() : undefined,
        vodMode: action === "setVodMode" ? vodMode : undefined,
        archiveDays: action === "setVodMode" && archiveDays ? Number(archiveDays) : undefined,
        minSpeedKbps:
          action === "setSpeed"
            ? clearSpeed && minSpeed.trim() === ""
              ? null
              : minSpeed.trim() === ""
                ? undefined
                : Number(minSpeed)
            : undefined,
        maxSpeedKbps:
          action === "setSpeed"
            ? clearSpeed && maxSpeed.trim() === ""
              ? null
              : maxSpeed.trim() === ""
                ? undefined
                : Number(maxSpeed)
            : undefined,
        backupUrl: action === "setBackupUrl" ? backupUrl.trim() : undefined,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      progress.finish();
      setMsg(`Updated ${data.count} items`);
    } else {
      progress.error(data.error ?? "Failed");
      setMsg(data.error ?? "Failed");
    }

    setSelected(new Set());
    loadStreams();
  }

  const categoryType = radioOnly ? "RADIO" : typeFilter ? categoryTypeForStream(typeFilter) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">{title}</h1>
        <Link href="/admin/management/mass-edit" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Mass edit
        </Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{description}</p>

      <div
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Filters
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
            Category
            <select
              className="rounded border px-3 py-2 bg-transparent min-w-[12rem]"
              style={{ borderColor: "var(--border)" }}
              value={filterCategoryId}
              onChange={(e) => {
                setFilterCategoryId(e.target.value);
                setPage(1);
                setSelected(new Set());
              }}
            >
              <option value="">All categories</option>
              <option value="0">Uncategorized only</option>
              {categories
                .filter((c) => !categoryType || c.categoryType === categoryType)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
            Bouquet
            <select
              className="rounded border px-3 py-2 bg-transparent min-w-[12rem]"
              style={{ borderColor: "var(--border)" }}
              value={filterBouquetId}
              onChange={(e) => {
                setFilterBouquetId(e.target.value);
                setPage(1);
                setSelected(new Set());
              }}
            >
              <option value="">All bouquets</option>
              {bouquets.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
            Status
            <select
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
                setSelected(new Set());
              }}
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs flex-1 min-w-[12rem]" style={{ color: "var(--muted)" }}>
            Search
            <input
              type="search"
              placeholder="Name, series, URL…"
              className="rounded border px-3 py-2 bg-transparent w-full"
              style={{ borderColor: "var(--border)" }}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                setSelected(new Set());
              }}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <select
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="enable">Enable</option>
          <option value="disable">Disable</option>
          <option value="delete">Delete</option>
          <option value="setCategory">Set category</option>
          <option value="clearCategory">Clear category</option>
          <option value="addToBouquet">Add to bouquet</option>
          <option value="removeFromBouquet">Remove from bouquet</option>
          <option value="setSpeed">Set min/max speed (Kbps)</option>
          <option value="setAdult">Set adult flag</option>
          {typeFilter === "LIVE" && <option value="setServer">Set streaming server</option>}
          {typeFilter === "LIVE" && <option value="setVodMode">Set on-demand mode</option>}
          {typeFilter === "LIVE" && <option value="setBackupUrl">Set backup URL</option>}
          {typeFilter === "LIVE" && <option value="clearBackupUrl">Clear backup URL</option>}
          {isVod && <option value="setContainerExtension">Set container (.mp4, .mkv…)</option>}
          {(episodesOnly || typeFilter === "SERIES") && (
            <option value="setSeriesName">Set series name</option>
          )}
        </select>

        {action === "setCategory" && (
          <CategorySelect
            className="rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={categoryId}
            onChange={setCategoryId}
            categories={categories}
            typeFilter={categoryType}
            emptyLabel="— select —"
          />
        )}

        {(action === "addToBouquet" || action === "removeFromBouquet") && (
          <select
            className="rounded border px-3 py-2 bg-transparent min-w-[12rem]"
            style={{ borderColor: "var(--border)" }}
            value={bouquetId}
            onChange={(e) => setBouquetId(e.target.value)}
          >
            <option value="">— bouquet —</option>
            {bouquets.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        {action === "setServer" && (
          <select
            className="rounded border px-3 py-2 bg-transparent min-w-[12rem]"
            style={{ borderColor: "var(--border)" }}
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
          >
            <option value="">— no server —</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {action === "setAdult" && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isAdult} onChange={(e) => setIsAdult(e.target.checked)} />
            Mark as adult
          </label>
        )}

        {action === "setContainerExtension" && (
          <select
            className="rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={containerExtension}
            onChange={(e) => setContainerExtension(e.target.value)}
          >
            {["mp4", "mkv", "avi", "mov", "ts", "m3u8"].map((ext) => (
              <option key={ext} value={ext}>.{ext}</option>
            ))}
          </select>
        )}

        {action === "setSeriesName" && (
          <input
            type="text"
            placeholder="Series name"
            className="rounded border px-3 py-2 bg-transparent min-w-[200px]"
            style={{ borderColor: "var(--border)" }}
            value={seriesName}
            onChange={(e) => setSeriesName(e.target.value)}
          />
        )}

        {action === "setVodMode" && (
          <>
            <select
              className="rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={vodMode}
              onChange={(e) => setVodMode(e.target.value)}
            >
              <option value="LIVE">Live only</option>
              <option value="ON_DEMAND">On demand</option>
              <option value="CATCHUP">Catch-up</option>
            </select>
            {vodMode === "CATCHUP" && (
              <input
                type="number"
                min={1}
                placeholder="Archive days"
                className="rounded border px-3 py-2 bg-transparent w-32"
                style={{ borderColor: "var(--border)" }}
                value={archiveDays}
                onChange={(e) => setArchiveDays(e.target.value)}
              />
            )}
          </>
        )}

        {action === "setSpeed" && (
          <>
            <input
              type="number"
              min={0}
              placeholder="Min Kbps"
              className="rounded border px-3 py-2 bg-transparent w-32"
              style={{ borderColor: "var(--border)" }}
              value={minSpeed}
              onChange={(e) => setMinSpeed(e.target.value)}
            />
            <input
              type="number"
              min={0}
              placeholder="Max Kbps"
              className="rounded border px-3 py-2 bg-transparent w-32"
              style={{ borderColor: "var(--border)" }}
              value={maxSpeed}
              onChange={(e) => setMaxSpeed(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={clearSpeed} onChange={(e) => setClearSpeed(e.target.checked)} />
              Clear empty fields
            </label>
          </>
        )}

        {action === "setBackupUrl" && (
          <input
            type="url"
            placeholder="https://backup.example/channel.m3u8"
            className="rounded border px-3 py-2 bg-transparent min-w-[280px]"
            style={{ borderColor: "var(--border)" }}
            value={backupUrl}
            onChange={(e) => setBackupUrl(e.target.value)}
          />
        )}

        <button
          type="button"
          onClick={() => void apply()}
          className="rounded px-4 py-2 cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Apply to {selected.size || "…"} selected
        </button>
      </div>

      {msg && <p className="text-sm">{msg}</p>}
      <ProgressBar progress={progress.progress} />

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded border px-2 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {selected.size} selected · {total} matching
        </span>
        {total > 0 && selected.size < total && (
          <button
            type="button"
            disabled={selectingAll}
            onClick={() => void selectAllMatching()}
            className="text-xs px-2 py-1 rounded border cursor-pointer disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            {selectingAll ? "Selecting…" : `Select all ${total} matching`}
          </button>
        )}
      </div>

      <div className="rounded-lg border overflow-auto max-h-[60vh]" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} />
              </th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Category</th>
              {typeFilter === "LIVE" && <th className="text-left p-3">Server</th>}
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Mode</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                </td>
                <td className="p-3">
                  {s.name}
                  {s.seriesName && (
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      {s.seriesName} S{s.seasonNum ?? "?"} E{s.episodeNum ?? "?"}
                    </span>
                  )}
                  {s.isAdult && (
                    <span className="ml-1 text-xs px-1 rounded" style={{ background: "var(--border)" }}>18+</span>
                  )}
                </td>
                <td className="p-3">{s.category?.name ?? "—"}</td>
                {typeFilter === "LIVE" && <td className="p-3">{s.server?.name ?? "—"}</td>}
                <td className="p-3">{s.type}</td>
                <td className="p-3">{s.vodMode && s.vodMode !== "LIVE" ? s.vodMode : "—"}</td>
                <td className="p-3">{s.isActive ? "Active" : "Off"}</td>
              </tr>
            ))}
            {!streams.length && (
              <tr>
                <td colSpan={typeFilter === "LIVE" ? 7 : 6} className="p-6 text-center" style={{ color: "var(--muted)" }}>
                  No streams match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--muted)" }}>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage(1)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>«</button>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>‹</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>›</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
