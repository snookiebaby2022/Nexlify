"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export type DualListItem = {
  id: string;
  label: string;
  sublabel?: string;
  group?: string;
};

export function DualListPicker({
  items,
  allItems,
  selectedIds,
  onChange,
  availableTitle = "Available",
  selectedTitle = "Selected",
  availableHint,
  selectedHint,
  searchPlaceholder = "Search…",
  emptyMessage = "No items",
}: {
  items: DualListItem[];
  /** Full catalog for resolving selected labels (defaults to items). */
  allItems?: DualListItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  availableTitle?: string;
  selectedTitle?: string;
  /** Short help shown under the left list title. */
  availableHint?: string;
  /** Short help shown under the right list title. */
  selectedHint?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [qAvail, setQAvail] = useState("");
  const [qSel, setQSel] = useState("");
  const [highlightAvail, setHighlightAvail] = useState<string[]>([]);
  const [highlightSel, setHighlightSel] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const catalog = allItems ?? items;
  const itemMap = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);

  const available = useMemo(() => {
    const ql = qAvail.trim().toLowerCase();
    return items.filter((i) => {
      if (selectedSet.has(i.id)) return false;
      if (!ql) return true;
      return (
        i.label.toLowerCase().includes(ql) ||
        (i.sublabel?.toLowerCase().includes(ql) ?? false) ||
        (i.group?.toLowerCase().includes(ql) ?? false)
      );
    });
  }, [items, selectedSet, qAvail]);

  const selected = useMemo(() => {
    const ql = qSel.trim().toLowerCase();
    return selectedIds
      .map((id) => itemMap.get(id))
      .filter((i): i is DualListItem => {
        if (!i) return false;
        if (!ql) return true;
        return (
          i.label.toLowerCase().includes(ql) ||
          (i.sublabel?.toLowerCase().includes(ql) ?? false) ||
          (i.group?.toLowerCase().includes(ql) ?? false)
        );
      });
  }, [selectedIds, itemMap, qSel]);

  const availableIds = useMemo(() => available.map((i) => i.id), [available]);

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

  function moveAllToSelected() {
    const next = new Set(selectedIds);
    for (const id of availableIds) next.add(id);
    onChange(Array.from(next));
    setHighlightAvail([]);
  }

  function moveAllToAvailable() {
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

  function renderList(
    rows: DualListItem[],
    highlight: string[],
    list: "avail" | "sel",
    query: string,
    setQuery: (v: string) => void,
    hint?: string
  ) {
    return (
      <div
        className="flex flex-col flex-1 min-w-0 rounded border"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="px-3 pt-2 pb-1 border-b" style={{ borderColor: "var(--border)" }}>
          {hint && (
            <p className="text-[11px] leading-snug mb-1.5" style={{ color: "var(--muted)" }}>
              {hint}
            </p>
          )}
        </div>
        <input
          type="search"
          placeholder={searchPlaceholder}
          className="mx-2 mt-2 rounded border px-2 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="flex-1 overflow-y-auto max-h-64 text-sm m-0 p-1 list-none">
          {rows.length === 0 && (
            <li className="px-2 py-4 text-center" style={{ color: "var(--muted)" }}>
              {emptyMessage}
            </li>
          )}
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => toggleHighlight(row.id, list)}
                onDoubleClick={() =>
                  list === "avail"
                    ? moveToSelected([row.id])
                    : moveToAvailable([row.id])
                }
                className="w-full text-left px-2 py-1.5 rounded cursor-pointer"
                style={{
                  background: highlight.includes(row.id)
                    ? "rgba(94,184,232,0.25)"
                    : "transparent",
                }}
              >
                <span className="block truncate font-medium">{row.label}</span>
                {(row.sublabel || row.group) && (
                  <span className="block text-xs truncate" style={{ color: "var(--muted)" }}>
                    {[row.group, row.sublabel].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const defaultAvailHint =
    availableHint ??
    "Items you can assign. Click to highlight, double-click one row to add it, or use → / ≫ to move.";
  const defaultSelHint =
    selectedHint ??
    "Items already assigned. Click to highlight, double-click to remove, or use ← / ≪ to move back.";

  return (
    <div className="space-y-2">
      <div className="flex flex-col md:flex-row gap-2 items-stretch">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
            {availableTitle} ({available.length})
          </p>
          {renderList(available, highlightAvail, "avail", qAvail, setQAvail, defaultAvailHint)}
        </div>

        <div className="flex md:flex-col gap-1.5 justify-center shrink-0 py-2">
          <button
            type="button"
            title="Add all visible"
            disabled={!availableIds.length}
            onClick={moveAllToSelected}
            className="rounded border px-2.5 py-2 text-sm cursor-pointer disabled:opacity-40 hover:bg-white/5"
            style={{ borderColor: "var(--border)" }}
          >
            <ChevronsRight size={16} className="mx-auto" />
            <span className="block text-[10px] mt-0.5 text-center">All</span>
          </button>
          <button
            type="button"
            title="Add highlighted"
            disabled={!highlightAvail.length}
            onClick={() => moveToSelected(highlightAvail)}
            className="rounded border px-2.5 py-2 text-sm cursor-pointer disabled:opacity-40 hover:bg-white/5"
            style={{ borderColor: "var(--border)" }}
          >
            <ChevronRight size={16} className="mx-auto" />
          </button>
          <button
            type="button"
            title="Remove highlighted"
            disabled={!highlightSel.length}
            onClick={() => moveToAvailable(highlightSel)}
            className="rounded border px-2.5 py-2 text-sm cursor-pointer disabled:opacity-40 hover:bg-white/5"
            style={{ borderColor: "var(--border)" }}
          >
            <ChevronLeft size={16} className="mx-auto" />
          </button>
          <button
            type="button"
            title="Remove all"
            disabled={!selectedIds.length}
            onClick={moveAllToAvailable}
            className="rounded border px-2.5 py-2 text-sm cursor-pointer disabled:opacity-40 hover:bg-white/5"
            style={{ borderColor: "var(--border)" }}
          >
            <ChevronsLeft size={16} className="mx-auto" />
            <span className="block text-[10px] mt-0.5 text-center">All</span>
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
            {selectedTitle} ({selected.length})
          </p>
          {renderList(selected, highlightSel, "sel", qSel, setQSel, defaultSelHint)}
        </div>
      </div>
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        Tip: ≫ adds every item in the left list (after search). ≪ clears the right list. Search filters each side
        independently.
      </p>
    </div>
  );
}
