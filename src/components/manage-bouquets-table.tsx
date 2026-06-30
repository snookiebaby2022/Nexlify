"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Plus, RefreshCw, Search } from "lucide-react";
import { BouquetRowActionsMenu } from "@/components/bouquet-row-actions-menu";

export type ManageBouquetRow = {
  id: string;
  displayId: number;
  name: string;
  isActive: boolean;
  streamCount: number;
  lineCount: number;
  sortOrder: number;
};

const PAGE_SIZES = [10, 25, 50, 100];

export function ManageBouquetsTable({
  bouquets,
  onRefresh,
}: {
  bouquets: ManageBouquetRow[];
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"displayId" | "name" | "streamCount" | "lineCount">("displayId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = bouquets;
    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q) || String(b.displayId).includes(q));
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const sa = String(av).toLowerCase();
      const sb = String(bv).toLowerCase();
      if (sa < sb) return sortDir === "asc" ? -1 : 1;
      if (sa > sb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [bouquets, search, sortKey, sortDir]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function toggleActive(b: ManageBouquetRow) {
    setBusyId(b.id);
    try {
      const res = await fetch("/api/admin/bouquets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, isActive: !b.isActive }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === "string" ? j.error : "Update failed");
      } else onRefresh();
    } finally {
      setBusyId(null);
    }
  }

  const thClass = "text-left px-3 py-3 font-normal text-xs whitespace-nowrap cursor-pointer select-none";
  const SortHead = ({ label, col }: { label: string; col: typeof sortKey }) => (
    <th className={thClass} onClick={() => toggleSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className="opacity-50" />
      </span>
    </th>
  );

  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <h1 className="text-lg font-semibold text-white">Manage Bouquets</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/bouquets/order"
            className="text-sm px-3 py-1.5 rounded font-medium text-white border border-white/70 hover:bg-white/10"
          >
            Order
          </Link>
          <Link
            href="/admin/bouquets/add"
            className="text-sm px-4 py-1.5 rounded font-medium text-white border border-white/70 hover:bg-white/10 inline-flex items-center gap-1"
          >
            <Plus size={14} />
            Add Bouquet
          </Link>
        </div>
      </div>

      <div
        className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 px-4 py-3 border-b text-sm"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.2)" }}
      >
        <label className="flex items-center gap-2" style={{ color: "var(--muted)" }}>
          Show
          <select
            className="panel-select rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)", background: "#fff", color: "#111" }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1.5 hover:bg-white/5"
            style={{ borderColor: "var(--border)" }}
            onClick={onRefresh}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <label className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <span style={{ color: "var(--muted)" }}>Search</span>
            <span className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                className="rounded border pl-8 pr-3 py-2 text-sm w-full sm:w-48 md:w-64 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: "rgba(0,0,0,0.25)" }}>
            <tr>
              <SortHead label="ID" col="displayId" />
              <SortHead label="Name" col="name" />
              <th className={thClass.replace("cursor-pointer", "")}>Status</th>
              <SortHead label="Streams" col="streamCount" />
              <SortHead label="Lines" col="lineCount" />
              <th className={thClass.replace("cursor-pointer", "")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                  No bouquets found
                </td>
              </tr>
            ) : (
              pageRows.map((b) => (
                <tr key={b.id} className="border-t hover:bg-white/[0.02]" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-3 tabular-nums">{b.displayId}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/bouquets/${b.id}`} className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`xui-pill xui-pill--${b.isActive ? "yes" : "no"}`}>{b.isActive ? "Active" : "Off"}</span>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{b.streamCount}</td>
                  <td className="px-3 py-3 tabular-nums">{b.lineCount}</td>
                  <td className="px-3 py-3">
                    <BouquetRowActionsMenu
                      bouquetId={b.id}
                      isActive={b.isActive}
                      busy={busyId === b.id}
                      onToggleActive={() => void toggleActive(b)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t text-sm"
        style={{ borderColor: "var(--border)" }}
      >
        <span style={{ color: "var(--muted)" }}>
          Showing {total === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 rounded border disabled:opacity-40"
            style={{ borderColor: "var(--border)" }}
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="tabular-nums">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            className="px-3 py-1 rounded border disabled:opacity-40"
            style={{ borderColor: "var(--border)" }}
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
