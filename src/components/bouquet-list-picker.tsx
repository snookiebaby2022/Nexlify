"use client";

import { useMemo, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

export type BouquetListItem = { id: string; name: string };

export function BouquetListPicker({
  bouquets,
  selectedIds,
  onChange,
}: {
  bouquets: BouquetListItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [qAvail, setQAvail] = useState("");
  const [qSel, setQSel] = useState("");
  const [highlightAvail, setHighlightAvail] = useState<string[]>([]);
  const [highlightSel, setHighlightSel] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const available = useMemo(() => {
    const ql = qAvail.trim().toLowerCase();
    return bouquets.filter((b) => {
      if (selectedSet.has(b.id)) return false;
      if (!ql) return true;
      return b.name.toLowerCase().includes(ql);
    });
  }, [bouquets, selectedSet, qAvail]);

  const selected = useMemo(() => {
    const ql = qSel.trim().toLowerCase();
    return selectedIds
      .map((id) => bouquets.find((b) => b.id === id))
      .filter((b): b is BouquetListItem => {
        if (!b) return false;
        if (!ql) return true;
        return b.name.toLowerCase().includes(ql);
      });
  }, [selectedIds, bouquets, qSel]);

  function toggle(id: string, list: "avail" | "sel") {
    if (list === "avail") {
      setHighlightAvail((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    } else {
      setHighlightSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    }
  }

  function moveAllRight() {
    const next = new Set(selectedIds);
    available.forEach((b) => next.add(b.id));
    onChange(Array.from(next));
    setHighlightAvail([]);
  }

  function moveAllLeft() {
    onChange([]);
    setHighlightSel([]);
  }

  function moveHighlightedRight() {
    const next = [...selectedIds];
    for (const id of highlightAvail) {
      if (!next.includes(id)) next.push(id);
    }
    onChange(next);
    setHighlightAvail([]);
  }

  function moveHighlightedLeft() {
    const remove = new Set(highlightSel);
    onChange(selectedIds.filter((id) => !remove.has(id)));
    setHighlightSel([]);
  }

  const boxStyle = {
    borderColor: "var(--border)",
    background: "rgba(0,0,0,0.25)",
  };

  function renderPanel(
    side: "avail" | "sel",
    rows: BouquetListItem[],
    countLabel: string,
    query: string,
    setQuery: (v: string) => void,
    highlight: string[],
    onMoveAll: () => void,
    moveAllIcon: "right" | "left"
  ) {
    return (
      <div className="flex flex-col flex-1 min-w-0 rounded border overflow-hidden min-h-[300px]" style={boxStyle}>
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 border-b text-sm"
          style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.04)" }}
        >
          <span style={{ color: "var(--muted)" }}>{countLabel}</span>
          <button
            type="button"
            title={moveAllIcon === "right" ? "Add all bouquets" : "Remove all bouquets"}
            onClick={onMoveAll}
            className="px-2 py-1 rounded cursor-pointer hover:bg-white/10 text-lg leading-none"
            style={{ color: "var(--accent)" }}
          >
            {moveAllIcon === "right" ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
          </button>
        </div>
        <input
          type="search"
          placeholder="Filter"
          className="mx-2 mt-2 rounded border px-3 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="flex-1 overflow-y-auto m-0 p-1 list-none text-sm min-h-[200px]">
          {rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs" style={{ color: "var(--muted)" }}>
              {side === "sel" ? "Empty list" : "No bouquets"}
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => toggle(row.id, side)}
                  onDoubleClick={() => {
                    if (side === "avail") {
                      if (!selectedIds.includes(row.id)) onChange([...selectedIds, row.id]);
                    } else {
                      onChange(selectedIds.filter((id) => id !== row.id));
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 rounded cursor-pointer truncate"
                  style={{
                    background: highlight.includes(row.id) ? "rgba(0,192,239,0.22)" : "transparent",
                  }}
                >
                  {row.name}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Bouquets</p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Choose channel packages for this line. Use ≫ to assign all bouquets, ≪ to clear. Click rows to
        highlight, then use the side buttons or double-click a row.
      </p>
      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        {renderPanel(
          "avail",
          available,
          `Showing all ${available.length}`,
          qAvail,
          setQAvail,
          highlightAvail,
          moveAllRight,
          "right"
        )}
        <div className="flex lg:flex-col flex-row gap-2 justify-center items-center shrink-0 py-4">
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm cursor-pointer disabled:opacity-40"
            style={{ borderColor: "var(--border)" }}
            disabled={!highlightAvail.length && !available.length}
            onClick={() => (highlightAvail.length ? moveHighlightedRight() : moveAllRight())}
          >
            →
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm cursor-pointer disabled:opacity-40"
            style={{ borderColor: "var(--border)" }}
            disabled={!highlightSel.length && !selectedIds.length}
            onClick={() => (highlightSel.length ? moveHighlightedLeft() : moveAllLeft())}
          >
            ←
          </button>
        </div>
        {renderPanel(
          "sel",
          selected,
          selected.length === 0 ? "Empty list" : `${selected.length} selected`,
          qSel,
          setQSel,
          highlightSel,
          moveAllLeft,
          "left"
        )}
      </div>
    </div>
  );
}
