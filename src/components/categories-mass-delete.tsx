"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CategoryTypeTabs,
  CATEGORY_TYPE_LABELS,
  type CategoryTab,
} from "@/components/category-type-tabs";
import { CategorySelect } from "@/components/category-select";
import type { CategoryOptionInput } from "@/lib/category-options";

const PAGE_SIZES = [25, 50, 100] as const;

type CategoryRow = {
  id: string;
  name: string;
  categoryType: string;
  isAdult: boolean;
  sortOrder: number;
  parentId: string | null;
  parent?: { name: string } | null;
  _count?: { streams: number; children: number };
  activeCount?: number;
  inactiveCount?: number;
};

export function CategoriesMassDeletePanel() {
  const [tab, setTab] = useState<CategoryTab>("LIVE");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [allCategories, setAllCategories] = useState<CategoryOptionInput[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("delete");
  const [moveToCategoryId, setMoveToCategoryId] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [categoryType, setCategoryType] = useState<CategoryTab>("LIVE");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const load = useCallback(() => {
    fetch(`/api/admin/categories?type=${tab}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setAllCategories(d.categories ?? []));
  }, [tab]);

  useEffect(() => {
    load();
    setSelected(new Set());
    setPage(1);
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.parent?.name ?? "").toLowerCase().includes(q)
    );
  }, [categories, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const allOnPage = paged.length > 0 && paged.every((c) => selected.has(c.id));

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  function togglePage() {
    const n = new Set(selected);
    if (allOnPage) paged.forEach((c) => n.delete(c.id));
    else paged.forEach((c) => n.add(c.id));
    setSelected(n);
  }

  async function apply() {
    if (!selected.size || busy) return;
    if (action === "delete") {
      const moveNote = moveToCategoryId ? " Streams will be moved to the target category." : " Streams in deleted categories become uncategorized.";
      if (!confirm(`Delete ${selected.size} categor${selected.size === 1 ? "y" : "ies"} (and subcategories)?${moveNote}`)) return;
    }
    if ((action === "moveStreams" || (action === "delete" && moveToCategoryId)) && action === "moveStreams" && !moveToCategoryId) {
      setMsg("Choose a target category to move streams into");
      return;
    }

    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/categories/mass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          action,
          moveStreamsToCategoryId:
            action === "delete" || action === "moveStreams"
              ? moveToCategoryId || null
              : undefined,
          isAdult: action === "setAdult" ? isAdult : undefined,
          sortOrder: action === "setSortOrder" ? Number(sortOrder) : undefined,
          categoryType: action === "setType" ? categoryType : undefined,
        }),
      });
      const data = await res.json();
      setMsg(res.ok ? `Done — affected ${data.count} item(s)` : data.error || "Failed");
      if (res.ok) {
        setSelected(new Set());
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">Mass delete — categories</h1>
        <Link href="/admin/management/tools/mass-delete" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Mass delete
        </Link>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Bulk delete categories, move or clear their streams, toggle adult flag, enable/disable all streams in a category, or change sort order.
      </p>

      <CategoryTypeTabs active={tab} onChange={setTab} />

      <div className="flex flex-wrap gap-3 items-end">
        <select
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="delete">Delete categories</option>
          <option value="moveStreams">Move streams to category</option>
          <option value="clearStreams">Uncategorize streams (clear category)</option>
          <option value="enableStreams">Enable all streams in category</option>
          <option value="disableStreams">Disable all streams in category</option>
          <option value="setAdult">Set adult flag</option>
          <option value="setSortOrder">Set sort order</option>
          <option value="setType">Change category type</option>
        </select>

        {(action === "delete" || action === "moveStreams") && (
          <CategorySelect
            className="rounded border px-3 py-2 bg-transparent min-w-[12rem]"
            style={{ borderColor: "var(--border)" }}
            value={moveToCategoryId}
            onChange={setMoveToCategoryId}
            categories={allCategories}
            typeFilter={tab}
            emptyLabel={action === "delete" ? "Uncategorize streams" : "— target —"}
          />
        )}

        {action === "setAdult" && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isAdult} onChange={(e) => setIsAdult(e.target.checked)} />
            Adult category
          </label>
        )}

        {action === "setSortOrder" && (
          <input
            type="number"
            className="rounded border px-3 py-2 bg-transparent w-24"
            style={{ borderColor: "var(--border)" }}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        )}

        {action === "setType" && (
          <select
            className="rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={categoryType}
            onChange={(e) => setCategoryType(e.target.value as CategoryTab)}
          >
            {(Object.keys(CATEGORY_TYPE_LABELS) as CategoryTab[]).map((t) => (
              <option key={t} value={t}>{CATEGORY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          disabled={busy || !selected.size}
          onClick={() => void apply()}
          className="rounded px-4 py-2 cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Apply to {selected.size || "…"} selected
        </button>
      </div>

      {msg && <p className="text-sm">{msg}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search categories…"
          className="rounded border px-3 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
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
          {selected.size} selected · {filtered.length} in {CATEGORY_TYPE_LABELS[tab]}
        </span>
        {filtered.length > 0 && selected.size < filtered.length && (
          <button
            type="button"
            onClick={() => setSelected(new Set(filtered.map((c) => c.id)))}
            className="text-xs px-2 py-1 rounded border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
          >
            Select all {filtered.length}
          </button>
        )}
      </div>

      <div className="rounded-lg border overflow-auto max-h-[60vh]" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10">
                <input type="checkbox" checked={allOnPage} onChange={togglePage} />
              </th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Parent</th>
              <th className="text-left p-3">Streams</th>
              <th className="text-left p-3">Subcats</th>
              <th className="text-left p-3">Order</th>
              <th className="text-left p-3">Adult</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                </td>
                <td className="p-3">{c.name}</td>
                <td className="p-3">{c.parent?.name ?? "—"}</td>
                <td className="p-3">
                  {c._count?.streams ?? 0}
                  <span className="text-xs block" style={{ color: "var(--muted)" }}>
                    {c.activeCount ?? 0} on · {c.inactiveCount ?? 0} off
                  </span>
                </td>
                <td className="p-3">{c._count?.children ?? 0}</td>
                <td className="p-3">{c.sortOrder}</td>
                <td className="p-3">{c.isAdult ? "Yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--muted)" }}>Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>‹</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}
