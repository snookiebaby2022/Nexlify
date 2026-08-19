"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Package, Search } from "lucide-react";
import type { DualListItem } from "@/components/dual-list-picker";
import { XuiDualListPicker } from "@/components/xui-dual-list-picker";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-page-sizes";

export function BouquetForm({
  bouquetId,
  title,
  backHref = "/admin/bouquets",
  manageLabel = "Manage Bouquets",
}: {
  bouquetId?: string;
  title: string;
  backHref?: string;
  manageLabel?: string;
}) {
  const [name, setName] = useState("");
  const [streamIds, setStreamIds] = useState<string[]>([]);
  const [items, setItems] = useState<DualListItem[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<DualListItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<"" | "LIVE" | "MOVIE" | "SERIES">("");
  const [availSearch, setAvailSearch] = useState("");
  const [pickerTotal, setPickerTotal] = useState(0);
  const [contentCounts, setContentCounts] = useState({ streams: 0, movies: 0, series: 0, stations: 0, total: 0 });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(!!bouquetId);
  const [saving, setSaving] = useState(false);
  const [loadingPicker, setLoadingPicker] = useState(true);

  const loadPicker = useCallback(() => {
    setLoadingPicker(true);
    const params = new URLSearchParams({
      picker: "1",
      page: "1",
      pageSize: String(DEFAULT_LIST_PAGE_SIZE),
    });
    if (availSearch.trim()) params.set("search", availSearch.trim());
    if (typeFilter) params.set("type", typeFilter);
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setPickerTotal(d.total ?? d.items?.length ?? 0);
      })
      .finally(() => setLoadingPicker(false));
  }, [availSearch, typeFilter]);

  useEffect(() => {
    const t = setTimeout(() => loadPicker(), 250);
    return () => clearTimeout(t);
  }, [loadPicker]);

  useEffect(() => {
    if (!bouquetId) return;
    fetch(`/api/admin/bouquets?id=${bouquetId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.bouquet) {
          setName(d.bouquet.name);
          const ids: string[] = d.streamIds ?? [];
          setStreamIds(ids);
          if (d.bouquet.contentCounts) setContentCounts(d.bouquet.contentCounts);
          const fromBouquet = (d.items ?? []) as DualListItem[];
          if (Array.isArray(fromBouquet) && fromBouquet.length) {
            setSelectedCatalog(fromBouquet);
          }
        }
        setLoading(false);
      });
  }, [bouquetId]);

  const hydrateSelectedLabels = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const params = new URLSearchParams({
      picker: "1",
      lite: "1",
      page: "1",
      pageSize: "50",
      ids: ids.slice(0, 50).join(","),
    });
    fetch(`/api/admin/streams?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const extra = (d.items ?? []) as DualListItem[];
        if (!extra.length) return;
        setSelectedCatalog((prev) => {
          const map = new Map(prev.map((i) => [i.id, i]));
          let changed = false;
          for (const i of extra) {
            const cur = map.get(i.id);
            if (!cur || cur.label !== i.label) {
              map.set(i.id, i);
              changed = true;
            }
          }
          return changed ? Array.from(map.values()) : prev;
        });
      })
      .catch(() => undefined);
  }, []);

  // Merge newly loaded available items into selected catalog labels when possible
  useEffect(() => {
    if (!items.length) return;
    setSelectedCatalog((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      let changed = false;
      for (const i of items) {
        const cur = map.get(i.id);
        if (cur && cur.label !== i.label) {
          map.set(i.id, i);
          changed = true;
        }
      }
      return changed ? Array.from(map.values()) : prev;
    });
  }, [items]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/bouquets", {
      method: bouquetId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bouquetId,
        name,
        streamIds,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Save failed");
      return;
    }
    window.location.href = backHref;
  }

  const catalog = useMemo(() => {
    const map = new Map<string, DualListItem>();
    for (const i of selectedCatalog) map.set(i.id, i);
    for (const i of items) map.set(i.id, i);
    return Array.from(map.values());
  }, [items, selectedCatalog]);

  if (loading) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Loading bouquet…
      </p>
    );
  }

  const liveCount = contentCounts.streams;
  const movieCount = contentCounts.movies;
  const seriesCount = contentCounts.series;

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0,192,239,0.15)" }}
          >
            <Package size={20} style={{ color: "#00c0ef" }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">
              {title}
              {name.trim() ? `: ${name}` : ""}
            </h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {bouquetId ? "Edit bouquet contents and order" : "Create a new bouquet and assign streams"}
            </p>
          </div>
        </div>
        <Link
          href={backHref}
          className="text-sm px-4 py-2 rounded border font-medium"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          {manageLabel}
        </Link>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div
          className="rounded-lg border p-4 md:p-5 space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium mb-1.5 block">
                Bouquet name <span style={{ color: "#ef4444" }}>*</span>
              </span>
              <input
                required
                className="w-full rounded border px-3 py-2.5 text-sm bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Premium UK, Sports Pack"
              />
            </label>
            <div className="flex flex-wrap items-end gap-3 text-xs" style={{ color: "var(--muted)" }}>
              <span>
                Selected: <strong className="text-[var(--fg)]">{streamIds.length}</strong>
              </span>
              <span>Live {liveCount}</span>
              <span>Movies {movieCount}</span>
              <span>Series {seriesCount}</span>
            </div>
          </div>
        </div>

        <div
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm flex-1 min-w-[200px]">
              <Search size={16} style={{ color: "var(--muted)" }} />
              <input
                type="search"
                className="flex-1 rounded border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--border)" }}
                placeholder="Search streams (loads 50 at a time)…"
                value={availSearch}
                onChange={(e) => setAvailSearch(e.target.value)}
              />
            </label>
            <select
              className="rounded border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            >
              <option value="">All types</option>
              <option value="LIVE">Live TV</option>
              <option value="MOVIE">Movies</option>
              <option value="SERIES">TV Series</option>
            </select>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {loadingPicker
              ? "Loading streams…"
              : `Showing ${items.length.toLocaleString()} of ${pickerTotal.toLocaleString()} matching streams (max ${DEFAULT_LIST_PAGE_SIZE} per search). Use search to find more.`}
          </p>
          <XuiDualListPicker
            items={items}
            allItems={catalog}
            selectedIds={streamIds}
            onChange={setStreamIds}
            onVisibleSelectedIds={hydrateSelectedLabels}
          />
        </div>

        {msg ? (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {msg}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded px-5 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving ? "Saving…" : bouquetId ? "Save bouquet" : "Create bouquet"}
        </button>
      </form>
    </div>
  );
}
