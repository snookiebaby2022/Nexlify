"use client";

import { useEffect, useMemo, useState, memo } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import {
  CategoryTypeTabs,
  CATEGORY_TYPE_LABELS,
  type CategoryTab,
} from "@/components/category-type-tabs";

type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  parentId: string | null;
  categoryType: CategoryTab;
  isAdult: boolean;
  _count: { streams: number };
};

type CategoryNode = CategoryRow & { children: CategoryNode[]; depth: number };

function buildTree(cats: CategoryRow[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  cats.forEach((c) => map.set(c.id, { ...c, children: [], depth: 0 }));
  cats.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      const parent = map.get(c.parentId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else roots.push(node);
  });
  roots.sort((a, b) => a.sortOrder - b.sortOrder);
  roots.forEach((r) => r.children.sort((a, b) => a.sortOrder - b.sortOrder));
  return roots;
}

function flattenTree(nodes: CategoryNode[], expanded: Set<string>): CategoryNode[] {
  const result: CategoryNode[] = [];
  function walk(n: CategoryNode) {
    result.push(n);
    if (expanded.has(n.id)) n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

const TreeRow = memo(function TreeRow({
  node,
  expanded,
  onToggle,
  onRemove,
  onMove,
}: {
  node: CategoryNode;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const hasChildren = node.children.length > 0;
  const indent = node.depth * 24;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b"
      style={{ borderColor: "var(--border)", paddingLeft: `${12 + indent}px` }}
    >
      <button
        type="button"
        className="shrink-0 w-5 h-5 flex items-center justify-center"
        onClick={hasChildren ? onToggle : undefined}
        style={{ opacity: hasChildren ? 1 : 0.3 }}
      >
        {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <ChevronRight size={14} className="opacity-0" />}
      </button>
      {hasChildren ? <FolderOpen size={14} style={{ color: "var(--accent)" }} /> : <Folder size={14} style={{ color: "var(--muted)" }} />}
      <span className="flex-1 font-medium text-sm">{node.name}</span>
      {node.isAdult && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Adult</span>
      )}
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        {node._count.streams} streams
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="p-1 rounded hover:bg-white/10" onClick={() => onMove(-1)}>
          <ArrowUp size={12} />
        </button>
        <button type="button" className="p-1 rounded hover:bg-white/10" onClick={() => onMove(1)}>
          <ArrowDown size={12} />
        </button>
        <button type="button" className="p-1 rounded text-red-400 hover:bg-red-400/10 text-xs" onClick={onRemove}>
          Delete
        </button>
      </div>
    </div>
  );
});

export default function ManagementCategoriesPage() {
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([]);
  const [tab, setTab] = useState<CategoryTab>("LIVE");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setAllCategories(d.categories ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  const tabCategories = useMemo(
    () => allCategories.filter((c) => (c.categoryType ?? "LIVE") === tab),
    [allCategories, tab]
  );

  const tabCounts = useMemo(() => {
    const counts: Partial<Record<CategoryTab, number>> = {};
    for (const t of ["LIVE", "MOVIE", "SERIES", "RADIO"] as CategoryTab[]) {
      counts[t] = allCategories.filter((c) => (c.categoryType ?? "LIVE") === t).length;
    }
    return counts;
  }, [allCategories]);

  const tree = useMemo(() => buildTree(tabCategories), [tabCategories]);
  const flat = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: parentId || null, categoryType: tab, isAdult }),
    });
    if (!res.ok) {
      setMsg((await res.json()).error ?? "Failed");
      return;
    }
    setMsg("Category added — drag order with arrows.");
    setName("");
    setParentId("");
    setIsAdult(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this category? Streams will be uncategorized.")) return;
    await fetch(`/api/admin/categories?id=${id}`, { method: "DELETE" });
    load();
  }

  async function move(id: string, dir: -1 | 1) {
    const list = [...tabCategories];
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    setBusy(true);
    await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: list.map((c) => c.id) }),
    });
    setBusy(false);
    load();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div
        className="flex items-center justify-between px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <h1 className="text-lg font-semibold text-white">Categories</h1>
        <Link
          href="/admin/content/streams"
          className="text-sm px-4 py-1.5 rounded border border-white/70 text-white hover:bg-white/10"
        >
          Manage streams
        </Link>
      </div>

      <CategoryTypeTabs active={tab} onChange={setTab} counts={tabCounts} />

      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <strong style={{ color: "var(--accent)" }}>{CATEGORY_TYPE_LABELS[tab]}</strong> categories — used to
        organize {tab === "LIVE" ? "live channels" : tab === "MOVIE" ? "movies" : tab === "SERIES" ? "TV series" : "radio stations"} in playlists and Xtream API.
      </div>

      <form
        onSubmit={add}
        className="rounded-lg border p-4 grid md:grid-cols-2 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <label className="block text-sm md:col-span-2">
          <span className="font-medium">Category type</span>
          <select
            className="mt-1.5 w-full rounded border px-3 py-2 panel-select bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={tab}
            onChange={(e) => setTab(e.target.value as CategoryTab)}
          >
            {(Object.keys(CATEGORY_TYPE_LABELS) as CategoryTab[]).map((k) => (
              <option key={k} value={k}>
                {CATEGORY_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Category name</span>
          <input
            placeholder="e.g. UK Entertainment"
            required
            className="mt-1.5 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Parent category</span>
          <select
            className="mt-1.5 w-full rounded border px-3 py-2 panel-select bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">— No parent (top-level) —</option>
            {tabCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2 cursor-pointer">
          <input type="checkbox" checked={isAdult} onChange={(e) => setIsAdult(e.target.checked)} />
          Adult content category
        </label>
        <div className="md:col-span-2 flex items-center gap-3">
          <button type="submit" className="rounded px-5 py-2 text-sm font-medium" style={{ background: "var(--accent)", color: "#fff" }}>
            Add category
          </button>
          {msg && <span className="text-sm text-green-400">{msg}</span>}
        </div>
      </form>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        {flat.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            expanded={expanded.has(node.id)}
            onToggle={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              })
            }
            onRemove={() => remove(node.id)}
            onMove={(dir) => move(node.id, dir)}
          />
        ))}
        {!tabCategories.length && (
          <p className="p-6 text-sm text-center" style={{ color: "var(--muted)" }}>
            No {CATEGORY_TYPE_LABELS[tab].toLowerCase()} categories yet.
          </p>
        )}
      </div>
      {busy && <p className="text-sm" style={{ color: "var(--muted)" }}>Saving order…</p>}
    </div>
  );
}
