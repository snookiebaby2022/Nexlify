"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import type { DualListItem } from "@/components/dual-list-picker";

export type SelectedFilter = "all" | "LIVE" | "MOVIE" | "SERIES";

function formatRowLabel(item: DualListItem) {
  const tag =
    item.sublabel === "LIVE"
      ? "channel"
      : item.sublabel === "MOVIE"
        ? "movie"
        : item.sublabel === "SERIES"
          ? "series"
          : "stream";
  return `[${tag}] ${item.label}`;
}

export function XuiDualListPicker({
  items,
  allItems,
  selectedIds,
  onChange,
  emptySelectedLabel = "Empty list",
}: {
  items: DualListItem[];
  allItems?: DualListItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptySelectedLabel?: string;
}) {
  const [qAvail, setQAvail] = useState("");
  const [qSel, setQSel] = useState("");
  const [highlightAvail, setHighlightAvail] = useState<string[]>([]);
  const [highlightSel, setHighlightSel] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<SelectedFilter>("all");
  const [dragId, setDragId] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const catalog = allItems ?? items;
  const itemMap = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);

  const available = useMemo(() => {
    const ql = qAvail.trim().toLowerCase();
    return items.filter((i) => {
      if (selectedSet.has(i.id)) return false;
      if (!ql) return true;
      return formatRowLabel(i).toLowerCase().includes(ql);
    });
  }, [items, selectedSet, qAvail]);

  const selectedOrdered = useMemo(() => {
    return selectedIds
      .map((id) => itemMap.get(id))
      .filter((i): i is DualListItem => !!i);
  }, [selectedIds, itemMap]);

  const selectedDisplayed = useMemo(() => {
    const ql = qSel.trim().toLowerCase();
    return selectedOrdered.filter((i) => {
      if (selectedFilter !== "all" && i.sublabel !== selectedFilter) return false;
      if (!ql) return true;
      return formatRowLabel(i).toLowerCase().includes(ql);
    });
  }, [selectedOrdered, qSel, selectedFilter]);

  function moveToSelected(ids: string[]) {
    const next = [...selectedIds];
    for (const id of ids) {
      if (!next.includes(id)) next.push(id);
    }
    onChange(next);
    setHighlightAvail([]);
  }

  function moveToAvailable(ids: string[]) {
    const remove = new Set(ids);
    onChange(selectedIds.filter((id) => !remove.has(id)));
    setHighlightSel([]);
  }

  function moveAllAvailable() {
    const next = new Set(selectedIds);
    for (const row of available) next.add(row.id);
    onChange(Array.from(next));
  }

  function moveAllSelected() {
    onChange([]);
    setHighlightSel([]);
  }

  function toggleHighlight(id: string, list: "avail" | "sel") {
    if (list === "avail") {
      setHighlightAvail((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else {
      setHighlightSel((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    }
  }

  function moveSelected(dir: -1 | 1) {
    if (highlightSel.length !== 1) return;
    const id = highlightSel[0];
    const idx = selectedIds.indexOf(id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  function dropOnRow(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...selectedIds];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    onChange(next);
    setDragId(null);
  }

  const listBoxClass =
    "xui-dual-list-panel flex flex-col flex-1 min-w-0 rounded overflow-hidden min-h-[220px] sm:min-h-[300px]";

  const transferBtnClass =
    "xui-dual-list-transfer-btn rounded px-3 py-2 cursor-pointer disabled:cursor-not-allowed";

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        <strong>Available streams</strong> — channels, movies, and series you can add to the bouquet. Use ≫ to add
        all, → for highlighted rows, or double-click a row. <strong>Selected</strong> — what subscribers on this
        bouquet will see; ≪ removes all, ← removes highlighted.
      </p>
      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        <div className={listBoxClass}>
          <div
            className="flex items-center justify-between gap-2 px-2 py-2 border-b text-xs font-medium"
            style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}
          >
            <span>Available ({available.length})</span>
          </div>
          <p className="xui-dual-list-hint text-[11px] px-2 pt-2 pb-0">
            Pick streams from your panel catalog (not yet in this bouquet).
          </p>
          <div className="flex items-center gap-2 px-2 py-2 border-b" style={{ borderColor: "#e5e7eb" }}>
            <Search size={16} className="opacity-50 shrink-0" />
            <input
              type="search"
              placeholder="Search available…"
              className="flex-1 text-sm outline-none bg-transparent"
              value={qAvail}
              onChange={(e) => setQAvail(e.target.value)}
            />
          </div>
          <ul className="flex-1 overflow-y-auto min-h-[140px] max-h-80 text-sm m-0 p-1 list-none">
            {available.length === 0 ? (
              <li className="xui-dual-list-hint px-2 py-6 text-center text-xs">
                {items.length === 0
                  ? "No streams in catalog — add streams first under Content → Streams."
                  : selectedSet.size >= items.length
                    ? "All streams are already in this bouquet."
                    : "No streams match your search."}
              </li>
            ) : (
              available.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => toggleHighlight(row.id, "avail")}
                    onDoubleClick={() => moveToSelected([row.id])}
                    className={`w-full text-left px-2 py-1.5 rounded cursor-pointer font-mono text-xs ${
                      highlightAvail.includes(row.id) ? "xui-dual-list-row--highlight" : ""
                    }`}
                  >
                    {formatRowLabel(row)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-row lg:flex-col gap-2 justify-center shrink-0 py-2 lg:py-4">
          <button
            type="button"
            title="Add all available"
            disabled={!available.length}
            onClick={moveAllAvailable}
            className={transferBtnClass}
          >
            <ChevronsRight size={18} />
          </button>
          <button
            type="button"
            title="Add selected"
            disabled={!highlightAvail.length}
            onClick={() => moveToSelected(highlightAvail)}
            className={transferBtnClass}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            title="Remove selected"
            disabled={!highlightSel.length}
            onClick={() => moveToAvailable(highlightSel)}
            className={transferBtnClass}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            title="Remove all from bouquet"
            disabled={!selectedIds.length}
            onClick={moveAllSelected}
            className={transferBtnClass}
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-w-0 gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium" style={{ color: "var(--muted)" }}>
              {selectedIds.length === 0 ? emptySelectedLabel : `${selectedIds.length} in bouquet`}
            </span>
            <label className="flex items-center gap-2">
              <span style={{ color: "var(--muted)" }}>Filter selected</span>
              <select
                className="panel-select rounded border px-2 py-1 text-sm"
                style={{ borderColor: "#d1d5db", background: "#fff", color: "#111" }}
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value as SelectedFilter)}
              >
                <option value="all">Show all</option>
                <option value="LIVE">Live / channel</option>
                <option value="MOVIE">Movies</option>
                <option value="SERIES">Series</option>
              </select>
            </label>
          </div>

          <div className={listBoxClass}>
            <div
              className="flex items-center justify-between gap-2 px-2 py-2 border-b text-xs font-medium"
              style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}
            >
              <span>
                {selectedDisplayed.length === 0 && selectedIds.length === 0
                  ? emptySelectedLabel
                  : `${selectedDisplayed.length} shown`}
              </span>
            </div>
            <p className="xui-dual-list-hint text-[11px] px-2 pt-2 pb-0">
              Streams in this bouquet (drag to reorder when unfiltered).
            </p>
            <div
              className="flex items-center justify-between gap-2 px-2 py-2 border-b"
              style={{ borderColor: "#e5e7eb" }}
            >
              <input
                type="search"
                placeholder="Filter selected…"
                className="flex-1 text-sm outline-none bg-transparent"
                value={qSel}
                onChange={(e) => setQSel(e.target.value)}
              />
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  title="Remove selected"
                  disabled={!highlightSel.length}
                  onClick={() => moveToAvailable(highlightSel)}
                  className={`${transferBtnClass} px-2 py-1`}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  title="Remove all"
                  disabled={!selectedIds.length}
                  onClick={moveAllSelected}
                  className={`${transferBtnClass} px-2 py-1`}
                >
                  <ChevronsLeft size={16} />
                </button>
              </div>
            </div>
            <ul
              className="flex-1 overflow-y-auto min-h-[140px] max-h-80 text-sm m-0 p-1 list-none"
              onDragOver={(e) => e.preventDefault()}
            >
              {selectedDisplayed.length === 0 ? (
                <li className="xui-dual-list-hint px-2 py-6 text-center text-xs">
                  {selectedIds.length === 0
                    ? emptySelectedLabel
                    : "No streams match the filter — try Show all."}
                </li>
              ) : (
                selectedDisplayed.map((row) => (
                  <li
                    key={row.id}
                    draggable={selectedFilter === "all" && !qSel.trim()}
                    onDragStart={() => setDragId(row.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropOnRow(row.id);
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleHighlight(row.id, "sel")}
                      onDoubleClick={() => moveToAvailable([row.id])}
                      className={`w-full text-left px-2 py-1.5 rounded cursor-grab active:cursor-grabbing font-mono text-xs ${
                        highlightSel.includes(row.id)
                          ? "xui-dual-list-row--highlight"
                          : dragId === row.id
                            ? "xui-dual-list-row--drag"
                            : ""
                      }`}
                      style={{ opacity: dragId && dragId !== row.id ? 0.85 : 1 }}
                    >
                      {formatRowLabel(row)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              title="Move up in bouquet order"
              disabled={highlightSel.length !== 1}
              onClick={() => moveSelected(-1)}
              className={transferBtnClass}
            >
              ↑
            </button>
            <button
              type="button"
              title="Move down in bouquet order"
              disabled={highlightSel.length !== 1}
              onClick={() => moveSelected(1)}
              className={transferBtnClass}
            >
              ↓
            </button>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Drag rows to reorder · order is saved with the bouquet
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
