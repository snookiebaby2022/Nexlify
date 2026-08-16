"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, ChevronDown, Plus, RefreshCw, Search } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";
import { CopyableCredential } from "@/components/copyable-credential";

export type ManageSubResellerRow = {
  id: string;
  displayId: number;
  username: string;
  password?: string;
  email: string;
  isActive: boolean;
  credits: number;
  maxLines: number;
  notes: string;
  lines: number;
  subUsers: number;
  parentUsername: string | null;
  groupId?: string | null;
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
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"displayId" | "username" | "credits" | "lines">("displayId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.groups ?? []) as { id: string; name: string }[];
        setGroups(list);
        const preferred = list.find((g) => g.name === "Sub-resellers") ?? list[0];
        if (preferred) setBulkGroupId(preferred.id);
      })
      .catch(() => {});
  }, []);

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

  const openRow = pageRows.find((r) => r.id === openMenuId) ?? null;

  const reposition = useCallback(() => {
    if (!btnRef.current) return;
    const anchor = btnRef.current.getBoundingClientRect();
    const size = {
      width: menuRef.current?.offsetWidth || 220,
      height: menuRef.current?.offsetHeight || 260,
    };
    const pos = computePortalMenuPosition(anchor, size);
    setMenuPos({ top: pos.top, left: pos.left });
    setFlipped(pos.flipped);
  }, []);

  useLayoutEffect(() => {
    if (!openMenuId) return;
    reposition();
  }, [openMenuId, reposition]);

  useEffect(() => {
    if (!openMenuId) return;
    const onScroll = () => reposition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenuId, reposition]);

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

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAllPage(checked: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) pageRows.forEach((r) => n.add(r.id));
      else pageRows.forEach((r) => n.delete(r.id));
      return n;
    });
  }

  async function runBulk() {
    if (!bulkAction || selected.size === 0 || bulkBusy) return;
    if (bulkAction === "setGroup" && !bulkGroupId) {
      alert("Choose a group");
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/users/mass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          action: bulkAction,
          groupId: bulkAction === "setGroup" ? bulkGroupId : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) alert(typeof j.error === "string" ? j.error : "Bulk update failed");
      else {
        setSelected(new Set());
        setBulkAction("");
        onRefresh();
      }
    } finally {
      setBulkBusy(false);
    }
  }

  const thClass = "text-left px-3 py-3 font-normal text-xs whitespace-nowrap cursor-pointer select-none";

  return (
    <div
      className="rounded-lg border"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-t-lg"
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
        <div className="flex flex-wrap items-center gap-2">
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
          <select
            className="rounded border px-2 py-1.5 text-sm bg-transparent"
            style={{ borderColor: "var(--border)", color: "inherit" }}
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
          >
            <option value="">Bulk actions</option>
            <option value="setGroup">Change group</option>
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
          </select>
          {bulkAction === "setGroup" && (
            <select
              className="rounded border px-2 py-1.5 text-sm bg-transparent min-w-[10rem]"
              style={{ borderColor: "var(--border)", color: "inherit" }}
              value={bulkGroupId}
              onChange={(e) => setBulkGroupId(e.target.value)}
            >
              <option value="">Select group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm cursor-pointer disabled:opacity-40"
            style={{ borderColor: "var(--border)" }}
            disabled={!bulkAction || selected.size === 0 || bulkBusy}
            onClick={() => void runBulk()}
          >
            Apply{selected.size ? ` (${selected.size})` : ""}
          </button>
        </div>
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
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => toggleAllPage(e.target.checked)}
                  aria-label="Select all on page"
                />
              </th>
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
              <th className={thClass.replace("cursor-pointer", "")}>Password</th>
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
                <td colSpan={11} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                  No sub-resellers yet
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-white/[0.02]" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelected(r.id)}
                      aria-label={`Select ${r.username}`}
                    />
                  </td>
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
                  <td className="px-3 py-3">
                    {r.password ? (
                      <CopyableCredential value={r.password} masked />
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        —
                      </span>
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
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      ref={openMenuId === r.id ? btnRef : undefined}
                      className={`xui-lines-action-btn ${openMenuId === r.id ? "xui-lines-action-btn--open" : ""}`}
                      onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                    >
                      <span>Actions</span>
                      <ChevronDown size={14} className="xui-lines-action-chevron" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openRow &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button type="button" className="xui-lines-action-backdrop" aria-label="Close menu" onClick={() => setOpenMenuId(null)} />
            <div
              ref={menuRef}
              className={`xui-lines-action-menu xui-lines-action-menu--portal ${flipped ? "xui-lines-action-menu--up" : ""}`}
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <Link
                href={`/admin/resellers/${openRow.id}/edit`}
                className="xui-lines-action-menu-item"
                onClick={() => setOpenMenuId(null)}
              >
                Edit user
              </Link>
              <Link href={`/admin/resellers`} className="xui-lines-action-menu-item" onClick={() => setOpenMenuId(null)}>
                Manage in users
              </Link>
              <Link href={`/admin/lines?owner=${openRow.id}`} className="xui-lines-action-menu-item" onClick={() => setOpenMenuId(null)}>
                View lines ({openRow.lines})
              </Link>
              <button type="button" className="xui-lines-action-menu-item" onClick={() => void addCredits(openRow)}>
                Add credits
              </button>
              <button type="button" className="xui-lines-action-menu-item" onClick={() => void toggleActive(openRow)}>
                {openRow.isActive ? "Disable" : "Enable"}
              </button>
              <Link
                href={`/admin/resellers/credits?userId=${openRow.id}`}
                className="xui-lines-action-menu-item"
                onClick={() => setOpenMenuId(null)}
              >
                Credit history
              </Link>
              <button
                type="button"
                className="xui-lines-action-menu-item xui-lines-action-menu-item--danger"
                onClick={() => void remove(openRow)}
              >
                Delete
              </button>
            </div>
          </>,
          document.body
        )}

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
