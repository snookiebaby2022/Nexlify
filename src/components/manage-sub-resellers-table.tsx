"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronDown, Plus, RefreshCw, Search } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export type ManageSubResellerRow = {
  id: string;
  displayId: number;
  username: string;
  email: string;
  isActive: boolean;
  credits: number;
  maxLines: number;
  notes: string;
  lines: number;
  subUsers: number;
  parentUsername: string | null;
  groupName: string;
  createdAt: string;
  lastLogin: string;
};

const PAGE_SIZES = [10, 25, 50, 100];

export function ManageSubResellersTable({
  resellers,
  onRefresh,
}: {
  resellers: ManageSubResellerRow[];
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"displayId" | "username" | "credits" | "lines">("displayId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = resellers;
    if (q) {
      list = list.filter(
        (r) =>
          r.username.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.parentUsername?.toLowerCase().includes(q) ?? false) ||
          r.groupName.toLowerCase().includes(q) ||
          String(r.displayId).includes(q)
      );
    }
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
  }, [resellers, search, sortKey, sortDir]);

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

  async function toggleActive(r: ManageSubResellerRow) {
    const res = await fetch("/api/admin/resellers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, isActive: !r.isActive }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "Update failed");
    } else {
      onRefresh();
    }
    setOpenMenuId(null);
  }

  async function addCredits(r: ManageSubResellerRow) {
    const raw = prompt(`Add credits to ${r.username}:`, "10");
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const res = await fetch("/api/admin/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: r.id,
        action: "add",
        amount,
        note: `Added from sub-resellers table`,
      }),
    });
    const j = await res.json();
    if (!res.ok) alert(j.error ?? "Failed");
    else onRefresh();
    setOpenMenuId(null);
  }

  async function remove(r: ManageSubResellerRow) {
    if (!confirm(`Delete sub-reseller "${r.username}"?`)) return;
    const res = await fetch(`/api/admin/resellers?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) alert(j.error ?? "Delete failed");
    else onRefresh();
    setOpenMenuId(null);
  }

  const thClass = "text-left px-3 py-3 font-normal text-xs whitespace-nowrap cursor-pointer select-none";

  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <h1 className="text-lg font-semibold text-white">Sub-resellers</h1>
        <Link
          href="/admin/resellers/add?role=sub"
          className="text-sm px-4 py-1.5 rounded font-medium text-white border border-white/70 hover:bg-white/10 inline-flex items-center gap-1"
        >
          <Plus size={14} />
          Add Sub-reseller
        </Link>
      </div>

      <p className="px-4 py-3 text-sm border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Sub-resellers operate under a parent reseller with allocated credits. Configure groups under{" "}
        <Link href="/admin/management/groups" className="underline" style={{ color: "var(--accent)" }}>
          Management → Groups
        </Link>
        .
      </p>

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
          <button type="button" className="rounded border px-2 py-1.5" style={{ borderColor: "var(--border)" }} onClick={onRefresh}>
            <RefreshCw size={14} />
          </button>
          <label className="flex items-center gap-2">
            <span style={{ color: "var(--muted)" }}>Search</span>
            <span className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                className="rounded border pl-8 pr-3 py-2 text-sm w-48 md:w-64 bg-transparent"
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
              <th className={thClass} onClick={() => toggleSort("displayId")}>
                <span className="inline-flex items-center gap-1">
                  ID <ArrowUpDown size={12} className="opacity-50" />
                </span>
              </th>
              <th className={thClass} onClick={() => toggleSort("username")}>
                <span className="inline-flex items-center gap-1">
                  Username <ArrowUpDown size={12} className="opacity-50" />
                </span>
              </th>
              <th className={thClass.replace("cursor-pointer", "")}>Parent</th>
              <th className={thClass.replace("cursor-pointer", "")}>Group</th>
              <th className={thClass.replace("cursor-pointer", "")}>Status</th>
              <th className={thClass} onClick={() => toggleSort("credits")}>
                <span className="inline-flex items-center gap-1">
                  Credits <ArrowUpDown size={12} className="opacity-50" />
                </span>
              </th>
              <th className={thClass} onClick={() => toggleSort("lines")}>
                <span className="inline-flex items-center gap-1">
                  Lines <ArrowUpDown size={12} className="opacity-50" />
                </span>
              </th>
              <th className={thClass.replace("cursor-pointer", "")}>Max lines</th>
              <th className={thClass.replace("cursor-pointer", "")}>Created</th>
              <th className={thClass.replace("cursor-pointer", "")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                  No sub-resellers yet
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-white/[0.02]" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-3 tabular-nums">{r.displayId}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: r.isActive ? "#22c55e" : "#6b7280" }}
                      />
                      <span className="font-medium">{r.username}</span>
                    </div>
                    {r.email && (
                      <p className="text-xs mt-0.5 truncate max-w-[180px]" style={{ color: "var(--muted)" }}>
                        {r.email}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">{r.parentUsername ?? "—"}</td>
                  <td className="px-3 py-3" style={{ color: "#e67e22" }}>
                    {r.groupName}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`xui-pill xui-pill--${r.isActive ? "yes" : "no"}`}>{r.isActive ? "Active" : "Off"}</span>
                  </td>
                  <td className="px-3 py-3 tabular-nums font-medium">{r.credits.toLocaleString()}</td>
                  <td className="px-3 py-3 tabular-nums">{r.lines}</td>
                  <td className="px-3 py-3 tabular-nums">{r.maxLines}</td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-3 py-3 relative overflow-visible">
                    <div className="xui-lines-action-wrap">
                      <button
                        type="button"
                        className={`xui-lines-action-btn ${openMenuId === r.id ? "xui-lines-action-btn--open" : ""}`}
                        onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                      >
                        <span>Actions</span>
                        <ChevronDown size={14} className="xui-lines-action-chevron" />
                      </button>
                      {openMenuId === r.id && (
                        <>
                          <button type="button" className="xui-lines-action-backdrop" onClick={() => setOpenMenuId(null)} />
                          <div className="xui-lines-action-menu" role="menu">
                            <Link href={`/admin/resellers`} className="xui-lines-action-menu-item" onClick={() => setOpenMenuId(null)}>
                              Manage in users
                            </Link>
                            <Link href={`/admin/lines?owner=${r.id}`} className="xui-lines-action-menu-item" onClick={() => setOpenMenuId(null)}>
                              View lines ({r.lines})
                            </Link>
                            <button type="button" className="xui-lines-action-menu-item" onClick={() => void addCredits(r)}>
                              Add credits
                            </button>
                            <button type="button" className="xui-lines-action-menu-item" onClick={() => void toggleActive(r)}>
                              {r.isActive ? "Disable" : "Enable"}
                            </button>
                            <Link href={`/admin/resellers/credits?userId=${r.id}`} className="xui-lines-action-menu-item" onClick={() => setOpenMenuId(null)}>
                              Credit history
                            </Link>
                            <button
                              type="button"
                              className="xui-lines-action-menu-item xui-lines-action-menu-item--danger"
                              onClick={() => void remove(r)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t text-sm" style={{ borderColor: "var(--border)" }}>
        <span style={{ color: "var(--muted)" }}>
          Showing {total === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" className="px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: "var(--border)" }} disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span>
            {safePage} / {totalPages}
          </span>
          <button type="button" className="px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: "var(--border)" }} disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
