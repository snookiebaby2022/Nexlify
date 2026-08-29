"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListPagination } from "@/components/list-pagination";

const PAGE_SIZES = [25, 50, 100, 200] as const;
type ContentType = "LIVE" | "MOVIE" | "SERIES";

export default function ChannelOrderPage() {
  const [streams, setStreams] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [contentType, setContentType] = useState<ContentType>("LIVE");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [catsReady, setCatsReady] = useState(false);

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
        if (type === "LIVE" && uk) setCategoryId(uk.id);
        else setCategoryId("");
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
    if (categoryId) params.set("categoryId", categoryId);
    fetch(`/api/admin/tools/channel-order?${params}`)
      .then((r) => r.json())
      .then((d) => setStreams(d.streams ?? []))
      .finally(() => setLoading(false));
  }, [categoryId, contentType, catsReady]);

  useEffect(() => {
    load();
    setPage(1);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return streams;
    return streams.filter((s) => s.name.toLowerCase().includes(q));
  }, [streams, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function move(i: number, dir: -1 | 1) {
    const globalIndex = (safePage - 1) * pageSize + i;
    const j = globalIndex + dir;
    if (j < 0 || j >= filtered.length) return;
    // Reorder within full filtered list, then map back to streams order for filtered items only is complex.
    // Simpler: reorder in the full streams array by finding IDs.
    const aId = filtered[globalIndex]?.id;
    const bId = filtered[j]?.id;
    if (!aId || !bId) return;
    const next = [...streams];
    const ai = next.findIndex((s) => s.id === aId);
    const bi = next.findIndex((s) => s.id === bId);
    if (ai < 0 || bi < 0) return;
    [next[ai], next[bi]] = [next[bi], next[ai]];
    setStreams(next);
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
            Reorder how clients see channels in playlists. Default category: UK Entertainment (when present).
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

      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => {
            setStreams([...streams].sort((a, b) => a.name.localeCompare(b.name)));
            setMsg("Alphabetical order applied. Save to confirm.");
          }}
        >
          Sort A-Z
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
        {categoryId ? ` · filtered category` : ""}
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {pageRows.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded border px-3 py-2"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <span className="text-xs tabular-nums w-8 text-right shrink-0" style={{ color: "var(--muted)" }}>
              {(safePage - 1) * pageSize + i + 1}
            </span>
            <span className="flex-1 text-sm truncate">{s.name}</span>
            <div className="flex gap-1">
              <button
                type="button"
                className="w-7 h-7 rounded flex items-center justify-center text-xs cursor-pointer hover:bg-white/10"
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="w-7 h-7 rounded flex items-center justify-center text-xs cursor-pointer hover:bg-white/10"
                onClick={() => move(i, 1)}
              >
                ↓
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
