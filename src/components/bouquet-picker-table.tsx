"use client";

import type { BouquetContentCounts } from "@/lib/bouquet-counts";

export type BouquetPickerRow = {
  id: string;
  name: string;
  contentCounts?: BouquetContentCounts;
};

export function BouquetPickerTable({
  bouquets,
  selectedIds,
  onChange,
}: {
  bouquets: BouquetPickerRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  function toggleAll() {
    if (selectedIds.length === bouquets.length) onChange([]);
    else onChange(bouquets.map((b) => b.id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Bouquets</p>
        <button type="button" className="text-xs underline" style={{ color: "var(--accent)" }} onClick={toggleAll}>
          {selectedIds.length === bouquets.length ? "Clear all" : "Select all"}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Select channel packages for this line. Counts show streams / movies / series / radio stations in each bouquet.
      </p>
      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "rgba(0,192,239,0.12)" }}>
            <tr>
              <th className="px-3 py-2 w-10" />
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">Bouquet name</th>
              <th className="px-3 py-2 text-center font-medium">Streams</th>
              <th className="px-3 py-2 text-center font-medium">Movies</th>
              <th className="px-3 py-2 text-center font-medium">Series</th>
              <th className="px-3 py-2 text-center font-medium">Stations</th>
            </tr>
          </thead>
          <tbody>
            {bouquets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs" style={{ color: "var(--muted)" }}>
                  No bouquets — create one under Bouquets → Add Bouquet
                </td>
              </tr>
            ) : (
              bouquets.map((b, i) => {
                const c = b.contentCounts ?? { streams: 0, movies: 0, series: 0, stations: 0, total: 0 };
                const empty = c.total === 0;
                return (
                  <tr
                    key={b.id}
                    className="border-t cursor-pointer hover:bg-white/[0.03]"
                    style={{
                      borderColor: "var(--border)",
                      background: selected.has(b.id) ? "rgba(0,192,239,0.1)" : undefined,
                    }}
                    onClick={() => toggle(b.id)}
                  >
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={selected.has(b.id)} readOnly />
                    </td>
                    <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {b.name}
                      {empty && (
                        <span className="ml-2 text-[10px] uppercase text-amber-400">empty</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.streams}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.movies}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.series}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.stations}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
