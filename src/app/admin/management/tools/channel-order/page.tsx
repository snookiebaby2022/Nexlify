"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { ListPagination } from "@/components/list-pagination";
import {
  applyStreamAutoOrder,
  STREAM_AUTO_ORDER_PRESETS,
  type StreamAutoOrderPresetId,
} from "@/lib/stream-auto-order";

const PAGE_SIZES = [25, 50, 100, 200, 500] as const;
type ContentType = "LIVE" | "MOVIE" | "SERIES";

type OrderStream = { id: string; name: string; categoryId: string | null };

export default function ChannelOrderPage() {
  const [streams, setStreams] = useState<OrderStream[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [contentType, setContentType] = useState<ContentType>("LIVE");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [catsReady, setCatsReady] = useState(false);
  const [preset, setPreset] = useState<StreamAutoOrderPresetId>("sky-uk");
  const [dragId, setDragId] = useState<string | null>(null);

  const loadCategories = useCallback((type: ContentType) => {
    setCatsReady(false);
    fetch(`/api/admin/categories?type=${type}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.categories ?? []) as { id: string; name: string }[];
        setCategories(list);
        const uk = list.find((c) => {
          const n = c.name.toLowerCase();
          return n === "uk entertainment" || n.includes("uk entertainment");
        });
        setSelectedCategoryIds(type === "LIVE" && uk ? [uk.id] : []);
        setCatsReady(true);
      })
      .catch(() => {
        setCategories([]);
        setCatsReady(true);
      });
  }, []);

  useEffect(() => {
    loadCategories(contentType);
    setPage(1);
  }, [contentType, loadCategories]);

  const load = useCallback(() => {
    if (!catsReady) return;
    setLoading(true);
    const params = new URLSearchParams({ type: contentType });
    if (selectedCategoryIds.length) params.set("categoryIds", selectedCategoryIds.join(","));
    fetch(`/api/admin/tools/channel-order?${params}`)
      .then((r) => r.json())
      .then((d) => setStreams(d.streams ?? []))
      .finally(() => setLoading(false));
  }, [selectedCategoryIds, contentType, catsReady]);

  useEffect(() => {
    load();
    setPage(1);
  }, [load]);

  const categoryNameById = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return streams;
    return streams.filter((s) => s.name.toLowerCase().includes(q));
  }, [streams, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function moveInList(list: OrderStream[], fromId: string, toId: string): OrderStream[] {
    if (fromId === toId) return list;
    const next = [...list];
    const from = next.findIndex((s) => s.id === fromId);
    const to = next.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0) return list;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }

  function move(i: number, dir: -1 | 1) {
    const globalIndex = (safePage - 1) * pageSize + i;
    const j = globalIndex + dir;
    if (j < 0 || j >= filtered.length) return;
    const aId = filtered[globalIndex]?.id;
    const bId = filtered[j]?.id;
    if (!aId || !bId) return;
    setStreams((prev) => moveInList(prev, aId, bId));
  }

  function applyPreset() {
    if (selectedCategoryIds.length > 1 || (selectedCategoryIds.length === 0 && streams.some((s) => s.categoryId))) {
      const groups = new Map<string, OrderStream[]>();
      for (const row of streams) {
        const key = row.categoryId ?? "";
        const list = groups.get(key) ?? [];
        list.push(row);
        groups.set(key, list);
      }
      const next: OrderStream[] = [];
      for (const list of groups.values()) {
        next.push(...applyStreamAutoOrder(list, preset));
      }
      setStreams(next);
    } else {
      setStreams(applyStreamAutoOrder(streams, preset));
    }
    setMsg(`${STREAM_AUTO_ORDER_PRESETS.find((p) => p.id === preset)?.label ?? "Auto"} order applied. Save to confirm.`);
  }

  async function save() {
    const res = await fetch("/api/admin/tools/channel-order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: streams.map((s) => s.id), type: contentType }),
    });
    setMsg(res.ok ? "Order saved" : "Failed");
    load();
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPage(1);
  }

  const tabs: { id: ContentType; label: string }[] = [
    { id: "LIVE", label: "Streams" },
    { id: "MOVIE", label: "Movies" },
    { id: "SERIES", label: "TV Series" },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap gap-3 items-start">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold">Channel order</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Drag channels or use the arrows. Auto-order can apply Sky UK / LCN, USA A–Z, and more per selected category.
          </p>
        </div>
        <Link href="/admin/management/tools" className="text-sm shrink-0" style={{ color: "var(--accent)" }}>
          ← Tools
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setContentType(t.id)}
            className="rounded-lg px-3 py-1.5 text-sm cursor-pointer"
            style={{
              background: contentType === t.id ? "var(--accent)" : "transparent",
              color: contentType === t.id ? "#fff" : "var(--text)",
              border: `1px solid ${contentType === t.id ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Categories</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setSelectedCategoryIds(categories.map((c) => c.id))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setSelectedCategoryIds([])}
            >
              Clear (all categories)
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
          {categories.map((c) => {
            const on = selectedCategoryIds.includes(c.id);
            return (
              <label
                key={c.id}
                className="inline-flex items-center gap-1.5 text-xs rounded border px-2 py-1 cursor-pointer"
                style={{
                  borderColor: on ? "var(--accent)" : "var(--border)",
                  background: on ? "rgba(0,192,239,0.12)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleCategory(c.id)}
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          Show
          <select
            className="rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
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
        <input
          type="search"
          placeholder="Search…"
          className="rounded border px-3 py-2 text-sm min-w-[10rem] flex-1"
          style={{ borderColor: "var(--border)" }}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          value={preset}
          onChange={(e) => setPreset(e.target.value as StreamAutoOrderPresetId)}
        >
          {STREAM_AUTO_ORDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={applyPreset}
          title={STREAM_AUTO_ORDER_PRESETS.find((p) => p.id === preset)?.description}
        >
          Auto-order
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => {
            load();
            setMsg("Reloaded from server.");
          }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => void save()}
          className="rounded px-4 py-2 cursor-pointer text-sm font-medium ml-auto"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Save order
        </button>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {loading ? "Loading…" : `${filtered.length} items`}
        {selectedCategoryIds.length ? ` · ${selectedCategoryIds.length} categor${selectedCategoryIds.length === 1 ? "y" : "ies"}` : " · all categories"}
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {pageRows.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded border px-3 py-2"
            style={{
              borderColor: dragId === s.id ? "var(--accent)" : "var(--border)",
              background: "var(--bg-card)",
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === s.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!dragId) return;
              setStreams((prev) => moveInList(prev, dragId, s.id));
              setDragId(null);
            }}
          >
            <span
              className="cursor-grab active:cursor-grabbing shrink-0"
              draggable
              title="Drag to reorder"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", s.id);
                setDragId(s.id);
              }}
              onDragEnd={() => setDragId(null)}
            >
              <GripVertical size={16} style={{ color: "var(--muted)" }} />
            </span>
            <span className="text-xs tabular-nums w-8 text-right shrink-0" style={{ color: "var(--muted)" }}>
              {(safePage - 1) * pageSize + i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{s.name}</span>
              {selectedCategoryIds.length !== 1 && s.categoryId ? (
                <span className="block text-[10px] truncate" style={{ color: "var(--muted)" }}>
                  {categoryNameById.get(s.categoryId) ?? "Uncategorized"}
                </span>
              ) : null}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                className="w-8 h-8 rounded flex items-center justify-center cursor-pointer hover:bg-white/10"
                title="Move up"
                aria-label="Move up"
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="w-8 h-8 rounded flex items-center justify-center cursor-pointer hover:bg-white/10"
                title="Move down"
                aria-label="Move down"
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ListPagination
        page={safePage}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
      />

      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
