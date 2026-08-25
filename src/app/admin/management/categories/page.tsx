"use client";

import { useEffect, useMemo, useState, memo, useCallback, Suspense, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Folder, FolderOpen, GripVertical, Plus, Zap } from "lucide-react";
import {
  CategoryTypeTabs,
  CATEGORY_TYPE_LABELS,
  type CategoryTab,
} from "@/components/category-type-tabs";
import {
  collectDescendantIdsLocal,
  labeledCategoryOptions,
} from "@/lib/category-options";
import { AutoLogosButton } from "@/components/auto-logos-button";

const PREDEFINED_CATEGORIES: Record<CategoryTab, string[]> = {
  LIVE: [
    "UK | Entertainment", "UK | Sports", "UK | News", "UK | Movies", "UK | Documentaries",
    "US | Entertainment", "US | Sports", "US | News", "US | Movies",
    "CA | Entertainment", "AU | Entertainment", "IE | Entertainment",
    "UK | Football", "UK | Cricket", "UK | Rugby", "UK | Boxing", "UK | UFC/MMA", "UK | Tennis", "UK | Golf", "UK | F1/Motorsport",
    "UK | News", "UK | Kids", "UK | Documentaries", "UK | Music", "UK | Religious", "XXX | Adult",
    "AR | Arabic", "TR | Turkish", "IN | Indian", "PK | Pakistani", "PH | Filipino", "African | Entertainment",
    "FR | Entertainment", "DE | Entertainment", "ES | Entertainment", "IT | Entertainment", "PT | Entertainment", "NL | Entertainment", "PL | Entertainment", "Scandinavian | Entertainment",
    "GR | Entertainment", "RO | Entertainment", "HU | Entertainment", "CZ | Entertainment", "Balkan | Entertainment",
    "CN | Entertainment", "JP | Entertainment", "KR | Entertainment", "TH | Entertainment", "VN | Entertainment",
    "Latino | Entertainment", "BR | Entertainment", "MX | Entertainment", "AR | Argentine", "CO | Colombian",
  ],
  MOVIE: [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music",
    "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
    "Bollywood", "Lollywood", "Turkish", "Arabic", "French", "Spanish",
    "Korean", "Japanese", "Chinese", "Thai",
  ],
  SERIES: [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music",
    "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
    "Bollywood", "Turkish", "Arabic", "Korean", "Japanese",
    "Reality", "Talk Show", "Game Show",
  ],
  RADIO: [
    "Music", "News", "Talk", "Sports", "Religious", "Comedy", "Classic", "Jazz", "Rock", "Pop",
  ],
};

function PredefinedCategories({
  tab,
  existingNames,
  onAdded,
}: {
  tab: CategoryTab;
  existingNames: string[];
  onAdded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const available = useMemo(
    () => PREDEFINED_CATEGORIES[tab].filter((c) => !existingNames.includes(c.toLowerCase())),
    [tab, existingNames]
  );

  const addOne = useCallback(async (name: string) => {
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, categoryType: tab, isAdult: false }),
    });
    return res.ok;
  }, [tab]);

  const addAll = useCallback(async () => {
    setBusy(true);
    setMsg("");
    let added = 0;
    for (const name of available) {
      const ok = await addOne(name);
      if (ok) added++;
    }
    setMsg(`Added ${added} categories`);
    setBusy(false);
    onAdded();
  }, [available, addOne, onAdded]);

  if (available.length === 0) return null;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={16} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold">Quick Add — {CATEGORY_TYPE_LABELS[tab]} Categories</span>
        </div>
        <button
          type="button"
          onClick={addAll}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded font-medium text-white"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "Adding…" : `Add all ${available.length}`}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {available.map((name) => (
          <button
            key={name}
            type="button"
            onClick={async () => {
              const ok = await addOne(name);
              if (ok) onAdded();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border hover:opacity-80 transition-opacity"
            style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.08)" }}
          >
            <Plus size={10} />
            {name}
          </button>
        ))}
      </div>
      {msg && <p className="text-xs text-green-400 mt-2">{msg}</p>}
    </div>
  );
}

type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  parentId: string | null;
  categoryType: CategoryTab;
  isAdult: boolean;
  activeCount?: number;
  inactiveCount?: number;
  _count: { streams: number };
};

type CategoryNode = CategoryRow & { children: CategoryNode[]; depth: number };

type CatStreamRow = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
};

function buildTree(cats: CategoryRow[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  cats.forEach((c) => map.set(c.id, { ...c, children: [], depth: 0 }));
  cats.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parentId && c.parentId !== c.id && map.has(c.parentId)) {
      const parent = map.get(c.parentId)!;
      // Avoid cycles: if parent is somehow under this node already, treat as root
      let p: CategoryNode | undefined = parent;
      let cycle = false;
      const seen = new Set<string>([node.id]);
      while (p) {
        if (seen.has(p.id)) {
          cycle = true;
          break;
        }
        seen.add(p.id);
        p = p.parentId && map.has(p.parentId) ? map.get(p.parentId) : undefined;
      }
      if (!cycle) {
        parent.children.push(node);
        node.depth = parent.depth + 1;
        return;
      }
    }
    roots.push(node);
  });
  roots.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  function sortRecursive(nodes: CategoryNode[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRecursive(n.children));
  }
  sortRecursive(roots);
  return roots;
}

function filterCategoryTree(nodes: CategoryNode[], q: string): CategoryNode[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return nodes;
  const out: CategoryNode[] = [];
  for (const n of nodes) {
    const children = filterCategoryTree(n.children, needle);
    if (n.name.toLowerCase().includes(needle) || children.length) {
      out.push({ ...n, children });
    }
  }
  return out;
}

function collectTreeIds(nodes: CategoryNode[], into: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    into.add(n.id);
    collectTreeIds(n.children, into);
  }
  return into;
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
  allCategories,
  dragId,
  dropTargetId,
  dragParentId,
  onToggle,
  onRemove,
  onMove,
  onRename,
  onReparent,
  onStreamsChanged,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDragLeaveRow,
  onDropOnRow,
}: {
  node: CategoryNode;
  expanded: boolean;
  allCategories: CategoryRow[];
  dragId: string | null;
  dropTargetId: string | null;
  dragParentId: string | null;
  onToggle: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onRename: (id: string, name: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onStreamsChanged: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverRow: (id: string) => void;
  onDragLeaveRow: () => void;
  onDropOnRow: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [editParent, setEditParent] = useState(node.parentId ?? "");
  const [showStreams, setShowStreams] = useState(false);
  const [streams, setStreams] = useState<CatStreamRow[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const didDragRef = useRef(false);
  const hasChildren = node.children.length > 0;
  const isDragging = dragId === node.id;
  const isDropTarget =
    dropTargetId === node.id &&
    dragId != null &&
    dragId !== node.id &&
    dragParentId === (node.parentId ?? null);
  const indent = node.depth * 24;
  const activeCount = node.activeCount ?? 0;
  const inactiveCount = node.inactiveCount ?? 0;
  const totalStreams = node._count.streams;
  const contentHref =
    node.categoryType === "MOVIE"
      ? `/admin/content/movies?categoryId=${node.id}`
      : node.categoryType === "SERIES"
        ? `/admin/content/series?categoryId=${node.id}`
        : `/admin/content/streams?categoryId=${node.id}`;

  const parentOptions = useMemo(() => {
    const blocked = collectDescendantIdsLocal(node.id, allCategories);
    blocked.add(node.id);
    return labeledCategoryOptions(
      allCategories.filter((c) => !blocked.has(c.id))
    );
  }, [allCategories, node.id]);

  function save() {
    if (editName.trim() && editName !== node.name) onRename(node.id, editName.trim());
    const newParent = editParent || null;
    if (newParent !== node.parentId) onReparent(node.id, newParent);
    setEditing(false);
  }

  async function loadStreams() {
    setStreamsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/streams?categoryId=${encodeURIComponent(node.id)}&page=1&pageSize=50&lite=1`
      );
      const data = await res.json();
      setStreams(data.streams ?? []);
    } catch {
      setStreams([]);
    } finally {
      setStreamsLoading(false);
    }
  }

  async function toggleShowStreams() {
    const next = !showStreams;
    setShowStreams(next);
    if (next) await loadStreams();
  }

  async function setCategoryActive(isActive: boolean) {
    const label = isActive ? "online (active)" : "offline";
    if (
      !confirm(
        `Set all streams in "${node.name}" (including subcategories) to ${label}?`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/categories/set-streams-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: node.id, isActive, includeDescendants: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Failed to update streams");
      } else {
        onStreamsChanged();
        if (showStreams) await loadStreams();
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function toggleOne(stream: CatStreamRow) {
    const res = await fetch("/api/admin/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stream.id, isActive: !stream.isActive }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to update stream");
      return;
    }
    setStreams((prev) =>
      prev.map((s) => (s.id === stream.id ? { ...s, isActive: !s.isActive } : s))
    );
    onStreamsChanged();
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{
          borderColor: "var(--border)",
          paddingLeft: `${12 + indent}px`,
          background: isDropTarget ? "rgba(0,192,239,0.12)" : isDragging ? "rgba(0,192,239,0.08)" : undefined,
        }}
        onDragOver={(e) => {
          if (dragId == null || dragParentId !== (node.parentId ?? null) || dragId === node.id) return;
          e.preventDefault();
          onDragOverRow(node.id);
        }}
        onDragLeave={onDragLeaveRow}
        onDrop={(e) => {
          if (dragId == null || dragParentId !== (node.parentId ?? null) || dragId === node.id) return;
          e.preventDefault();
          onDropOnRow(node.id);
        }}
      >
        <button
          type="button"
          className="shrink-0 w-5 h-5 flex items-center justify-center"
          onClick={hasChildren ? onToggle : undefined}
          style={{ opacity: hasChildren ? 1 : 0.3 }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <ChevronRight size={14} className="opacity-0" />
          )}
        </button>
        {hasChildren ? (
          <FolderOpen size={14} style={{ color: "var(--accent)" }} />
        ) : (
          <Folder size={14} style={{ color: "var(--muted)" }} />
        )}

        {editing ? (
          <>
            <input
              className="flex-1 text-sm rounded border px-2 py-1 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
            <select
              className="text-xs rounded border px-1 py-1 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={editParent}
              onChange={(e) => setEditParent(e.target.value)}
            >
              <option value="">— No parent —</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded text-white"
              style={{ background: "var(--accent)" }}
              onClick={save}
            >
              Save
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded"
              style={{ color: "var(--muted)" }}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <div
              className="flex flex-1 items-center gap-1.5 min-w-0 cursor-grab active:cursor-grabbing select-none"
              draggable={!editing}
              onDragStart={(e) => {
                didDragRef.current = true;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", node.id);
                onDragStart(node.id);
              }}
              onDragEnd={() => {
                onDragEnd();
                setTimeout(() => {
                  didDragRef.current = false;
                }, 0);
              }}
              title="Drag to reorder among siblings"
            >
              <GripVertical size={14} className="shrink-0 touch-none" style={{ color: "var(--muted)" }} />
              <button
                type="button"
                className="flex-1 text-left font-medium text-sm hover:opacity-90 min-w-0 truncate"
                onClick={() => {
                  if (didDragRef.current) return;
                  if (hasChildren) onToggle();
                  else toggleShowStreams();
                }}
                title={hasChildren ? "Expand/collapse" : "Edit streams"}
              >
                {node.name}
              </button>
            </div>
            {node.isAdult && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Adult</span>
            )}
            <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }} title="Active / inactive / total">
              <span className="text-green-400">{activeCount}</span>
              {" / "}
              <span className="text-red-400">{inactiveCount}</span>
              {" / "}
              {totalStreams}
            </span>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <button
                type="button"
                disabled={bulkBusy || totalStreams === 0}
                className="text-[10px] px-2 py-0.5 rounded text-white disabled:opacity-40"
                style={{ background: "#16a34a" }}
                title="Set all streams in this category online"
                onClick={() => setCategoryActive(true)}
              >
                Online
              </button>
              <button
                type="button"
                disabled={bulkBusy || totalStreams === 0}
                className="text-[10px] px-2 py-0.5 rounded text-white disabled:opacity-40"
                style={{ background: "#dc2626" }}
                title="Set all streams in this category offline"
                onClick={() => setCategoryActive(false)}
              >
                Offline
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 rounded border"
                style={{ borderColor: "var(--border)" }}
                onClick={toggleShowStreams}
              >
                {showStreams ? "Hide" : "Edit"}
              </button>
              <Link
                href={contentHref}
                className="text-[10px] px-2 py-0.5 rounded border"
                style={{ borderColor: "var(--border)", color: "var(--accent)" }}
              >
                Open
              </Link>
              <button
                type="button"
                className="p-1 rounded hover:bg-white/10 text-xs"
                title="Edit"
                onClick={() => {
                  setEditing(true);
                  setEditName(node.name);
                  setEditParent(node.parentId ?? "");
                }}
              >
                Rename
              </button>
              <button type="button" className="p-1 rounded hover:bg-white/10" onClick={() => onMove(-1)}>
                <ArrowUp size={12} />
              </button>
              <button type="button" className="p-1 rounded hover:bg-white/10" onClick={() => onMove(1)}>
                <ArrowDown size={12} />
              </button>
              <button
                type="button"
                className="p-1 rounded text-red-400 hover:bg-red-400/10 text-xs"
                onClick={onRemove}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {showStreams && (
        <div
          className="border-b px-3 py-2 space-y-1"
          style={{
            borderColor: "var(--border)",
            paddingLeft: `${28 + indent}px`,
            background: "rgba(0,0,0,0.12)",
          }}
        >
          {streamsLoading && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Loading streams…
            </p>
          )}
          {!streamsLoading && streams.length === 0 && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              No streams in this category.
            </p>
          )}
          {streams.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs py-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: s.isActive ? "#22c55e" : "#ef4444" }}
              />
              <span className="flex-1 truncate font-medium">{s.name}</span>
              <span style={{ color: "var(--muted)" }}>{s.type}</span>
              <button
                type="button"
                className="px-2 py-0.5 rounded text-white"
                style={{ background: s.isActive ? "#dc2626" : "#16a34a" }}
                onClick={() => toggleOne(s)}
              >
                {s.isActive ? "Set offline" : "Set online"}
              </button>
            </div>
          ))}
          {streams.length >= 100 && (
            <Link href={contentHref} className="text-xs underline" style={{ color: "var(--accent)" }}>
              View all in library →
            </Link>
          )}
        </div>
      )}
    </div>
  );
});

function streamTypeForCategoryTab(tab: CategoryTab): {
  streamType: "LIVE" | "MOVIE" | "SERIES";
  isRadio?: boolean;
  label: string;
} {
  if (tab === "MOVIE") return { streamType: "MOVIE", label: "movies" };
  if (tab === "SERIES") return { streamType: "SERIES", label: "series/episodes" };
  if (tab === "RADIO") return { streamType: "LIVE", isRadio: true, label: "radio stations" };
  return { streamType: "LIVE", label: "live channels" };
}

function CategoryRemoveDuplicateStreamsPanel({
  tab,
  onApplied,
  setMsg,
  setBusy,
  busy,
}: {
  tab: CategoryTab;
  onApplied: () => void;
  setMsg: (msg: string) => void;
  setBusy: (busy: boolean) => void;
  busy: boolean;
}) {
  const [samples, setSamples] = useState<{ kept: string; removed: string[] }[]>([]);
  const target = streamTypeForCategoryTab(tab);

  async function run(dryRun: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/streams/remove-duplicates-by-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamType: target.streamType,
          isRadio: target.isRadio,
          dryRun,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Remove duplicate streams failed");
        return;
      }
      setSamples(data.samples ?? []);
      if (dryRun) {
        setMsg(
          `Preview: ${data.duplicateGroups} duplicate name groups, ${data.merged} ${target.label} would be removed (${data.scanned} scanned)`
        );
        return;
      }
      setMsg(`Removed ${data.merged} duplicate ${target.label} with the same name`);
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div>
        <h2 className="text-sm font-semibold">Remove duplicate streams (same name)</h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Deletes extra {target.label} that share the exact same display name (case/spacing insensitive).
          Keeps the best copy (most bouquets, active, oldest). For URL/title fuzzy matching use{" "}
          <Link href="/admin/management/tools/remove-duplicates" className="underline" style={{ color: "var(--accent)" }}>
            Remove Duplicates tool
          </Link>
          .
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border"
          style={{ borderColor: "var(--border)" }}
          onClick={() => void run(true)}
        >
          Preview duplicates
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded font-medium text-white"
          style={{ background: "var(--accent)" }}
          onClick={() => {
            if (
              !confirm(
                `Delete duplicate ${target.label} with the same name? The kept copy in each group stays.`
              )
            ) {
              return;
            }
            void run(false);
          }}
        >
          {busy ? "Working…" : "Remove duplicate streams"}
        </button>
      </div>
      {samples.length > 0 && (
        <div
          className="rounded border max-h-48 overflow-y-auto text-xs font-mono"
          style={{ borderColor: "var(--border)" }}
        >
          {samples.map((s, i) => (
            <div
              key={`${s.kept}-${i}`}
              className="px-2 py-1 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-medium">{s.kept}</span>
              <span className="mx-2" style={{ color: "var(--muted)" }}>
                ←
              </span>
              <span style={{ color: "var(--muted)" }}>{s.removed.join(", ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryRemoveDuplicatesPanel({
  tab,
  onApplied,
  setMsg,
  setBusy,
  busy,
}: {
  tab: CategoryTab;
  onApplied: () => void;
  setMsg: (msg: string) => void;
  setBusy: (busy: boolean) => void;
  busy: boolean;
}) {
  const [samples, setSamples] = useState<{ kept: string; removed: string[] }[]>([]);

  async function run(dryRun: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/categories/remove-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryType: tab, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Remove duplicates failed");
        return;
      }
      setSamples(data.samples ?? []);
      if (dryRun) {
        setMsg(
          `Preview: ${data.duplicateGroups} duplicate name groups, ${data.merged} folders would be merged (${data.scanned} scanned)`
        );
        return;
      }
      setMsg(`Merged ${data.merged} duplicate folders with the same name`);
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div>
        <h2 className="text-sm font-semibold">Remove duplicate names</h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Finds {CATEGORY_TYPE_LABELS[tab].toLowerCase()} categories with the same name (case and spacing
          insensitive) and merges them — streams move to the kept folder.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border"
          style={{ borderColor: "var(--border)" }}
          onClick={() => void run(true)}
        >
          Preview duplicates
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded font-medium text-white"
          style={{ background: "var(--accent)" }}
          onClick={() => {
            if (
              !confirm(
                `Merge duplicate ${CATEGORY_TYPE_LABELS[tab].toLowerCase()} categories with the same name? Streams will be moved to the kept folder.`
              )
            ) {
              return;
            }
            void run(false);
          }}
        >
          {busy ? "Working…" : "Remove duplicates"}
        </button>
      </div>
      {samples.length > 0 && (
        <div
          className="rounded border max-h-48 overflow-y-auto text-xs font-mono"
          style={{ borderColor: "var(--border)" }}
        >
          {samples.map((s, i) => (
            <div
              key={`${s.kept}-${i}`}
              className="px-2 py-1 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-medium">{s.kept}</span>
              <span className="mx-2" style={{ color: "var(--muted)" }}>
                ←
              </span>
              <span style={{ color: "var(--muted)" }}>{s.removed.join(", ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryNameNormalizePanel({
  tab,
  onApplied,
  setMsg,
  setBusy,
  busy,
}: {
  tab: CategoryTab;
  onApplied: () => void;
  setMsg: (msg: string) => void;
  setBusy: (busy: boolean) => void;
  busy: boolean;
}) {
  const [samples, setSamples] = useState<{ from: string; to: string }[]>([]);

  async function run(dryRun: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/categories/normalize-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryType: tab, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Normalize failed");
        return;
      }
      setSamples(data.samples ?? []);
      if (dryRun) {
        setMsg(
          `Preview: ${data.renamed} rename, ${data.merged} merge, ${data.unchanged} already OK (${data.scanned} scanned)`
        );
        return;
      }
      setMsg(
        `Renamed ${data.renamed}, merged ${data.merged} duplicates — folders now use UK | … / US | … / XXX | … format`
      );
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div>
        <h2 className="text-sm font-semibold">Normalize folder names (XUI format)</h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Converts names like <code>UK Entertainment</code> → <code>UK | Entertainment</code>,{" "}
          <code>US Fubo</code> → <code>US | Fubo</code>, adult → <code>XXX | …</code>. Future SQL
          migrations apply this automatically on import.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border"
          style={{ borderColor: "var(--border)" }}
          onClick={() => void run(true)}
        >
          Preview renames
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded font-medium text-white"
          style={{ background: "var(--accent)" }}
          onClick={() => {
            if (
              !confirm(
                `Rename ${CATEGORY_TYPE_LABELS[tab].toLowerCase()} categories to XUI pipe format (UK | …)? Duplicates will be merged.`
              )
            ) {
              return;
            }
            void run(false);
          }}
        >
          {busy ? "Working…" : "Normalize names"}
        </button>
      </div>
      {samples.length > 0 && (
        <div
          className="rounded border max-h-48 overflow-y-auto text-xs font-mono"
          style={{ borderColor: "var(--border)" }}
        >
          {samples.map((s, i) => (
            <div
              key={`${s.from}-${i}`}
              className="px-2 py-1 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span style={{ color: "var(--muted)" }}>{s.from}</span>
              <span className="mx-2">→</span>
              <span>{s.to}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AUTO_SORT_PRESETS = [
  {
    id: "operator-order",
    label: "Operator order (Sky · US · Sports · 24/7 · A–Z)",
    hint: "UK in Sky EPG order, US network order, sports block, 24/7, then rest A–Z.",
    custom: false,
  },
  {
    id: "uk-sports-us",
    label: "UK → Sports → US → A–Z",
    hint: "UK & Ireland first, sports next, US/Canada, then the rest alphabetically.",
    custom: false,
  },
  {
    id: "country-groups",
    label: "Country groups",
    hint: "Group by region/country prefix, then A–Z inside each group.",
    custom: false,
  },
  {
    id: "alphabetical",
    label: "A–Z only",
    hint: "Reset to simple alphabetical order.",
    custom: false,
  },
  {
    id: "custom",
    label: "Custom tiers (one keyword per line)",
    hint: "First matching line wins. Example: UK, Sports, US",
    custom: true,
  },
] as const;

function CategoryAutoSortPanel({
  tab,
  onApplied,
  setMsg,
  setBusy,
  busy,
}: {
  tab: CategoryTab;
  onApplied: () => void;
  setMsg: (msg: string) => void;
  setBusy: (busy: boolean) => void;
  busy: boolean;
}) {
  const [preset, setPreset] = useState<(typeof AUTO_SORT_PRESETS)[number]["id"]>("operator-order");
  const [customLines, setCustomLines] = useState("UK\nSports\nFootball\nUS\nCanada");
  const [preview, setPreview] = useState<{ name: string; tier: number }[]>([]);
  const selected = AUTO_SORT_PRESETS.find((p) => p.id === preset)!;

  async function run(dryRun: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/categories/auto-sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryType: tab,
          preset,
          customLines: preset === "custom" ? customLines.split(/\r?\n/) : undefined,
          dryRun,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Auto-sort failed");
        return;
      }
      if (dryRun) {
        setPreview((data.preview ?? []).map((p: { name: string; tier: number }) => ({ name: p.name, tier: p.tier })));
        setMsg(`Preview: ${data.total} ${CATEGORY_TYPE_LABELS[tab].toLowerCase()} categories`);
        return;
      }
      setPreview([]);
      setMsg(`Auto-ordered ${data.updated} of ${data.total} categories — StbEmu/Xtream apps use this order on reload.`);
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div>
        <h2 className="text-sm font-semibold">Auto-order categories</h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          One-click ordering for {CATEGORY_TYPE_LABELS[tab].toLowerCase()} folders in StbEmu, XCIPTV, and other apps.
          Drag-and-drop above still works for fine-tuning.
        </p>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Sort preset</span>
        <select
          className="mt-1.5 w-full rounded border px-3 py-2 panel-select bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value as (typeof AUTO_SORT_PRESETS)[number]["id"]);
            setPreview([]);
          }}
        >
          {AUTO_SORT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {selected.hint}
      </p>
      {selected.custom && (
        <label className="block text-sm">
          <span className="font-medium">Custom tiers (top → bottom)</span>
          <textarea
            className="mt-1.5 w-full rounded border px-3 py-2 bg-transparent font-mono text-xs min-h-[120px]"
            style={{ borderColor: "var(--border)" }}
            value={customLines}
            onChange={(e) => setCustomLines(e.target.value)}
            placeholder={"UK\nSports\nUS"}
          />
          <span className="text-xs mt-1 block" style={{ color: "var(--muted)" }}>
            Each line is a tier. Categories matching that keyword (prefix or contains) are placed in that tier.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border"
          style={{ borderColor: "var(--border)" }}
          onClick={() => void run(true)}
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded font-medium text-white"
          style={{ background: "var(--accent)" }}
          onClick={() => {
            if (
              !confirm(
                `Apply auto-order to all ${CATEGORY_TYPE_LABELS[tab].toLowerCase()} categories? This updates sort order for every sibling group.`
              )
            ) {
              return;
            }
            void run(false);
          }}
        >
          {busy ? "Applying…" : "Apply order"}
        </button>
      </div>
      {preview.length > 0 && (
        <div
          className="rounded border max-h-48 overflow-y-auto text-xs font-mono"
          style={{ borderColor: "var(--border)" }}
        >
          {preview.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className="px-2 py-1 border-b flex justify-between gap-2"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="truncate">{p.name}</span>
              <span style={{ color: "var(--muted)" }}>tier {p.tier + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagementCategoriesInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const typeFromUrl = searchParams.get("type")?.toUpperCase();
  const initialTab: CategoryTab =
    typeFromUrl === "LIVE" || typeFromUrl === "MOVIE" || typeFromUrl === "SERIES" || typeFromUrl === "RADIO"
      ? typeFromUrl
      : "LIVE";
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([]);
  const [tab, setTab] = useState<CategoryTab>(initialTab);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [catQuery, setCatQuery] = useState("");

  function load() {
    fetch("/api/admin/categories")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setMsg(d.error ?? "Failed to load categories");
          return;
        }
        setAllCategories(d.categories ?? []);
      })
      .catch(() => setMsg("Failed to load categories"));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const raw = searchParams.get("type")?.toUpperCase();
    if (raw === "LIVE" || raw === "MOVIE" || raw === "SERIES" || raw === "RADIO") {
      setTab(raw);
    } else if (!raw) {
      setTab("LIVE");
    }
  }, [searchParams]);

  function changeTab(next: CategoryTab) {
    setTab(next);
    const base = pathname.includes("/management/categories")
      ? "/admin/management/categories"
      : "/admin/categories";
    router.replace(`${base}?type=${next}`);
  }
  const tabCategories = useMemo(
    () => allCategories.filter((c) => (c.categoryType ?? "LIVE") === tab),
    [allCategories, tab]
  );

  const parentSelectOptions = useMemo(
    () => labeledCategoryOptions(tabCategories),
    [tabCategories]
  );

  const tabCounts = useMemo(() => {
    const counts: Partial<Record<CategoryTab, number>> = {};
    for (const t of ["LIVE", "MOVIE", "SERIES", "RADIO"] as CategoryTab[]) {
      counts[t] = allCategories.filter((c) => (c.categoryType ?? "LIVE") === t).length;
    }
    return counts;
  }, [allCategories]);

  const tree = useMemo(() => {
    const built = buildTree(tabCategories);
    return filterCategoryTree(built, catQuery);
  }, [tabCategories, catQuery]);
  const displayExpanded = useMemo(() => {
    if (!catQuery.trim()) return expanded;
    return collectTreeIds(tree);
  }, [catQuery, tree, expanded]);
  const flat = useMemo(() => flattenTree(tree, displayExpanded), [tree, displayExpanded]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: parentId || null, categoryType: tab, isAdult }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setMsg("Category added — drag the name or use arrows to reorder siblings.");
    setName("");
    setParentId("");
    setIsAdult(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this category and all sub-categories? Streams will be uncategorized.")) return;
    const res = await fetch(`/api/admin/categories?id=${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Delete failed");
      return;
    }
    setMsg(`Deleted ${data.deleted ?? 1} categor${data.deleted === 1 ? "y" : "ies"}`);
    load();
  }

  async function renameCategory(id: string, newName: string) {
    const res = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: newName }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error ?? "Rename failed");
      return;
    }
    load();
  }

  async function reparentCategory(id: string, newParentId: string | null) {
    const res = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, parentId: newParentId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error ?? "Reparent failed");
      return;
    }
    load();
  }

  const dragParentId = useMemo(() => {
    if (!dragId) return null;
    return tabCategories.find((c) => c.id === dragId)?.parentId ?? null;
  }, [dragId, tabCategories]);

  async function saveSiblingOrder(list: CategoryRow[]) {
    setBusy(true);
    const res = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: list.map((c) => c.id) }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error ?? "Reorder failed");
      return false;
    }
    load();
    return true;
  }

  async function move(id: string, dir: -1 | 1) {
    const target = tabCategories.find((c) => c.id === id);
    if (!target) return;
    const siblings = tabCategories
      .filter((c) => (c.parentId ?? null) === (target.parentId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const idx = siblings.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= siblings.length) return;
    const list = [...siblings];
    [list[idx], list[j]] = [list[j], list[idx]];
    await saveSiblingOrder(list);
  }

  async function reorderSiblings(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = tabCategories.find((c) => c.id === fromId);
    const to = tabCategories.find((c) => c.id === toId);
    if (!from || !to) return;
    if ((from.parentId ?? null) !== (to.parentId ?? null)) return;
    const siblings = tabCategories
      .filter((c) => (c.parentId ?? null) === (from.parentId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const fromIdx = siblings.findIndex((c) => c.id === fromId);
    const toIdx = siblings.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const list = [...siblings];
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    await saveSiblingOrder(list);
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

      <CategoryTypeTabs active={tab} onChange={changeTab} counts={tabCounts} />

      <div
        className="rounded-lg border p-4 space-y-2"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Zap size={14} style={{ color: "var(--accent)" }} />
              Auto-add posters / icons (TMDB)
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Fills missing live logos and movie/series posters. Configure the API key under{" "}
              <Link href="/admin/settings/tmdb" className="underline" style={{ color: "var(--accent)" }}>
                Settings → TMDB
              </Link>
              .
            </p>
          </div>
          <Link href="/admin/settings/tmdb" className="text-xs underline" style={{ color: "var(--accent)" }}>
            TMDB settings
          </Link>
        </div>
        <AutoLogosButton />
      </div>

      {/* Predefined category quick-add */}
      <PredefinedCategories tab={tab} existingNames={tabCategories.map((c) => c.name.toLowerCase())} onAdded={load} />

      <CategoryRemoveDuplicatesPanel tab={tab} onApplied={load} setMsg={setMsg} setBusy={setBusy} busy={busy} />

      <label className="block text-sm max-w-md">
        <span className="font-medium">Find subcategory</span>
        <input
          className="mt-1.5 w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          placeholder="Type a name — parents stay open so nested folders are easy to find"
          value={catQuery}
          onChange={(e) => setCatQuery(e.target.value)}
        />
      </label>
      <CategoryRemoveDuplicateStreamsPanel tab={tab} onApplied={load} setMsg={setMsg} setBusy={setBusy} busy={busy} />
      <CategoryNameNormalizePanel tab={tab} onApplied={load} setMsg={setMsg} setBusy={setBusy} busy={busy} />

      <CategoryAutoSortPanel tab={tab} onApplied={load} setMsg={setMsg} setBusy={setBusy} busy={busy} />

      <div
        className="rounded-lg border p-4 text-sm space-y-2"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <p>
          <strong style={{ color: "var(--accent)" }}>{CATEGORY_TYPE_LABELS[tab]}</strong> categories use XUI folder names like{" "}
          <code>UK | Entertainment</code>, <code>US | Fubo</code>, <code>XXX | Adult</code> — same order in StbEmu/Xtream apps (drag names or use auto-order below).
        </p>
        <ul className="list-disc pl-5 space-y-1" style={{ color: "var(--muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Show in app:</strong> put the stream in a category, keep it
            online, and include it in a bouquet assigned to the line.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Hide from app:</strong> open the category →{" "}
            <em>Set offline</em> (disables its streams), or remove those streams from the line’s bouquets, or
            delete the category.
          </li>
          <li>
            Missing folders usually mean streams are only in category-named bouquets — run{" "}
            <Link href="/admin/bouquets" className="underline" style={{ color: "var(--accent)" }}>
              Bouquets → Fix category bouquets
            </Link>
            .
          </li>
        </ul>
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
            onChange={(e) => changeTab(e.target.value as CategoryTab)}
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
            placeholder="e.g. UK | Entertainment"
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
            {parentSelectOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
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
          {msg && (
            <span
              className={`text-sm ${
                /fail|error|cannot|required|not found|cycle/i.test(msg) ? "text-red-400" : "text-green-400"
              }`}
            >
              {msg}
            </span>
          )}
        </div>
      </form>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        {flat.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            expanded={displayExpanded.has(node.id)}
            allCategories={tabCategories}
            dragId={dragId}
            dropTargetId={dropTargetId}
            dragParentId={dragParentId}
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
            onRename={renameCategory}
            onReparent={reparentCategory}
            onStreamsChanged={load}
            onDragStart={setDragId}
            onDragEnd={() => {
              setDragId(null);
              setDropTargetId(null);
            }}
            onDragOverRow={setDropTargetId}
            onDragLeaveRow={() => setDropTargetId(null)}
            onDropOnRow={(targetId) => {
              if (!dragId) return;
              void reorderSiblings(dragId, targetId);
              setDragId(null);
              setDropTargetId(null);
            }}
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

export default function ManagementCategoriesPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm p-6" style={{ color: "var(--muted)" }}>
          Loading categories…
        </p>
      }
    >
      <ManagementCategoriesInner />
    </Suspense>
  );
}

