"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, ChevronDown, ExternalLink, List } from "lucide-react";
import { IpWithFlag } from "@/components/ip-with-flag";
import { CopyableCredential } from "@/components/copyable-credential";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";

export type ManageUserRow = {
  id: string;
  displayId: number;
  username: string;
  password?: string;
  email: string;
  role: string;
  roleLabel: string;
  isActive: boolean;
  credits: number;
  notes: string;
  owner: string | null;
  groupId: string | null;
  groupName: string;
  lines: number;
  subUsers?: number;
  createdAt?: string;
  lastLogin: string;
  ip: string | null;
};

type SortKey = keyof ManageUserRow | null;

const PAGE_SIZES = [10, 25, 50, 100];

function formatLastLogin(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function groupStyle(roleLabel: string) {
  const l = roleLabel.toLowerCase();
  if (l.includes("sub")) return { color: "#e67e22" };
  if (l === "admin" || (l.includes("admin") && !l.includes("reseller"))) return { color: "#e74c3c" };
  if (l.includes("reseller")) return { color: "#22c55e" };
  return { color: "var(--muted)" };
}

export function ManageUsersTable({
  users,
  onRefresh,
  panel = "admin",
}: {
  users: ManageUserRow[];
  onRefresh: () => void;
  panel?: "admin" | "reseller";
}) {
  const usersApi = panel === "reseller" ? "/api/reseller/users" : "/api/admin/resellers";
  const creditsApi = panel === "reseller" ? "/api/reseller/users/credits" : "/api/admin/credits";
  const addUserHref = panel === "reseller" ? "/reseller/users/add" : "/admin/resellers/add";
  const creditsHref = panel === "reseller" ? "/reseller/users/credits" : "/admin/resellers/credits";
  const linesHref = panel === "reseller" ? "/reseller/lines" : "/admin/lines";
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("role");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openAction, setOpenAction] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const canBulk = panel === "admin" || panel === "reseller";
  const massApi = panel === "admin" ? "/api/admin/users/mass" : "/api/reseller/users/mass";
  const groupsApi =
    panel === "admin" ? "/api/admin/groups" : "/api/reseller/groups?role=sub_reseller";

  useEffect(() => {
    if (!canBulk) return;
    fetch(groupsApi)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.groups ?? []) as { id: string; name: string }[];
        setGroups(list);
        const preferred =
          list.find((g) => /sub-?reseller/i.test(g.name)) ??
          list.find((g) => /reseller/i.test(g.name)) ??
          list[0];
        if (preferred) setBulkGroupId(preferred.id);
      })
      .catch(() => {});
  }, [canBulk, groupsApi]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (q) {
      list = users.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.groupName.toLowerCase().includes(q) ||
          String(u.displayId).includes(q) ||
          (u.owner?.toLowerCase().includes(q) ?? false)
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        if (sortKey === "role" || sortKey === "roleLabel") {
          const rank = (role: string) => {
            const r = String(role).toUpperCase();
            if (r === "ADMIN") return 0;
            if (r === "RESELLER") return 1;
            if (r === "SUB_RESELLER") return 2;
            return 3;
          };
          const ra = rank(a.role);
          const rb = rank(b.role);
          if (ra !== rb) return sortDir === "asc" ? ra - rb : rb - ra;
          const sa = a.username.toLowerCase();
          const sb = b.username.toLowerCase();
          if (sa < sb) return -1;
          if (sa > sb) return 1;
          return 0;
        }
        const av = a[sortKey as keyof ManageUserRow];
        const bv = b[sortKey as keyof ManageUserRow];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        const sa = String(av).toLowerCase();
        const sb = String(bv).toLowerCase();
        if (sa < sb) return sortDir === "asc" ? -1 : 1;
        if (sa > sb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [users, search, sortKey, sortDir]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const openRow = pageRows.find((u) => u.id === openAction) ?? null;

  const reposition = useCallback(() => {
    if (!btnRef.current) return;
    const anchor = btnRef.current.getBoundingClientRect();
    const size = {
      width: menuRef.current?.offsetWidth || 220,
      height: menuRef.current?.offsetHeight || 320,
    };
    const pos = computePortalMenuPosition(anchor, size);
    setMenuPos({ top: pos.top, left: pos.left });
    setFlipped(pos.flipped);
  }, []);

  useLayoutEffect(() => {
    if (!openAction) return;
    reposition();
  }, [openAction, reposition]);

  useEffect(() => {
    if (!openAction) return;
    const onScroll = () => reposition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAction(null);
    };
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [openAction, reposition]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Delete user "${name}"?`)) return;
    const url =
      panel === "reseller"
        ? `${usersApi}?id=${encodeURIComponent(id)}`
        : `/api/admin/resellers?id=${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) alert(j.error ?? "Delete failed");
      else onRefresh();
    } catch (e) {
      console.error("Delete user network error:", e);
      alert("Delete failed (network)");
    }
    setOpenAction(null);
  }

  async function toggleActive(u: ManageUserRow) {
    const res = await fetch(usersApi, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, isActive: !u.isActive }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Update failed");
    } else onRefresh();
    setOpenAction(null);
  }

  async function quickAddCredits(u: ManageUserRow, amount: number) {
    const res = await fetch(creditsApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: u.id,
        action: "add",
        amount,
        note: `Quick +${amount} from manage users`,
      }),
    });
    const j = await res.json();
    if (!res.ok) alert(j.error ?? "Failed to add credits");
    else onRefresh();
    setOpenAction(null);
  }

  async function promoteToAdmin(u: ManageUserRow) {
    if (u.role === "ADMIN") return;
    if (!confirm(`Promote "${u.username}" to Admin? They will get full panel access.`)) return;
    const res = await fetch(usersApi, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, role: "ADMIN" }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) alert(j.error ?? "Promote failed");
    else onRefresh();
    setOpenAction(null);
  }

  async function demoteToReseller(u: ManageUserRow) {
    if (u.role !== "ADMIN") return;
    if (!confirm(`Demote "${u.username}" from Admin to Reseller?`)) return;
    const res = await fetch(usersApi, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, role: "RESELLER" }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) alert(j.error ?? "Demote failed");
    else onRefresh();
    setOpenAction(null);
  }

  async function promptAddCredits(u: ManageUserRow) {
    const raw = prompt(`Add credits to ${u.username}:`, "10");
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a positive number");
      return;
    }
    await quickAddCredits(u, amount);
  }

  const selectableRows = useMemo(
    () => pageRows.filter((u) => u.role !== "ADMIN"),
    [pageRows]
  );
  const allPageSelected =
    selectableRows.length > 0 && selectableRows.every((u) => selected.has(u.id));

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
      if (checked) selectableRows.forEach((u) => n.add(u.id));
      else selectableRows.forEach((u) => n.delete(u.id));
      return n;
    });
  }

  async function runBulk() {
    if (!canBulk || !bulkAction || selected.size === 0 || bulkBusy) return;
    if (bulkAction === "setGroup" && !bulkGroupId) {
      alert("Choose a group");
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch(massApi, {
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

  const thClass =
    "text-left px-3 py-3 font-normal text-xs whitespace-nowrap cursor-pointer select-none";
  const SortHead = ({ label, col }: { label: string; col: SortKey }) => (
    <th className={thClass} onClick={() => toggleSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className="opacity-50" />
      </span>
    </th>
  );

  function ActionTrigger({ u }: { u: ManageUserRow }) {
    const open = openAction === u.id;
    return (
      <button
        type="button"
        ref={open ? btnRef : undefined}
        className={`xui-lines-action-btn ${open ? "xui-lines-action-btn--open" : ""}`}
        onClick={() => setOpenAction(open ? null : u.id)}
        aria-label="Actions"
      >
        <span className="hidden sm:inline">Actions</span>
        <List size={16} className="sm:hidden" />
        <ChevronDown size={14} className="xui-lines-action-chevron hidden sm:inline" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <h1 className="text-lg font-semibold text-white">Manage Users</h1>
        <Link
          href={addUserHref}
          className="text-sm px-4 py-1.5 rounded font-medium text-white border border-white/70 hover:bg-white/10 transition-colors"
        >
          Add User
        </Link>
      </div>

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
          {canBulk && (
            <>
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
              <Link
                href={
                  panel === "admin"
                    ? "/admin/management/mass-edit/users"
                    : "/reseller/users"
                }
                className="text-xs underline"
                style={{ color: "var(--accent)" }}
              >
                {panel === "admin" ? "Mass edit users" : "Refresh list"}
              </Link>
            </>
          )}
        </div>
        <label className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          <span style={{ color: "var(--muted)" }}>Search</span>
          <input
            type="search"
            className="rounded border px-3 py-2 text-sm w-full sm:w-48 md:w-64 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      <div className="md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {pageRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
            No users found
          </p>
        ) : (
          pageRows.map((u) => (
            <article key={u.id} className="panel-mobile-card p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-start gap-2">
                  {canBulk && u.role !== "ADMIN" && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(u.id)}
                      onChange={() => toggleSelected(u.id)}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        title={u.isActive ? "Enabled" : "Disabled"}
                        style={{ background: u.isActive ? "#22c55e" : "#6b7280" }}
                      />
                      <span className="font-semibold truncate">{u.username}</span>
                      <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--muted)" }}>
                        #{u.displayId}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                      {u.email || "No email"} · {u.groupName}
                    </p>
                    {u.password ? (
                      <div className="mt-1">
                        <CopyableCredential value={u.password} masked label="Pass" />
                      </div>
                    ) : null}
                  </div>
                </div>
                <ActionTrigger u={u} />
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    Credits
                  </dt>
                  <dd className="tabular-nums">{u.credits}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    Lines
                  </dt>
                  <dd className="tabular-nums">{u.lines}</dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              {canBulk && (
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => toggleAllPage(e.target.checked)}
                    aria-label="Select all on page"
                  />
                </th>
              )}
              <SortHead label="ID" col="displayId" />
              <th className="px-3 py-3 text-left font-normal text-xs">Status</th>
              <SortHead label="Owner" col="owner" />
              <SortHead label="Name" col="username" />
              <th className="px-3 py-3 text-left font-normal text-xs">Password</th>
              <SortHead label="Role" col="role" />
              <SortHead label="Email" col="email" />
              <SortHead label="Group" col="groupName" />
              <SortHead label="Lines" col="lines" />
              <SortHead label="Last Login" col="lastLogin" />
              <SortHead label="IP" col="ip" />
              <SortHead label="Credits" col="credits" />
              <SortHead label="Notes" col="notes" />
              <th className="px-3 py-3 text-left font-normal text-xs">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={canBulk ? 15 : 14} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                  No users found
                </td>
              </tr>
            ) : (
              pageRows.map((u) => (
                <tr key={u.id} className="border-b hover:bg-white/[0.03]" style={{ borderColor: "var(--border)" }}>
                  {canBulk && (
                    <td className="px-3 py-2.5">
                      {u.role !== "ADMIN" ? (
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleSelected(u.id)}
                          aria-label={`Select ${u.username}`}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-3 py-2.5 tabular-nums">{u.displayId}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      title={u.isActive ? "Enabled" : "Disabled"}
                      style={{ background: u.isActive ? "#22c55e" : "#6b7280" }}
                    />
                  </td>
                  <td className="px-3 py-2.5" style={{ color: "var(--muted)" }}>
                    {u.owner ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{u.username}</td>
                  <td className="px-3 py-2.5">
                    {u.password ? (
                      <CopyableCredential value={u.password} masked />
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted)" }} title="Shown after next password set/reset or first login (XUI crypt upgrade)">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs uppercase" style={{ color: "var(--muted)" }}>
                    {u.roleLabel || u.role}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: "var(--muted)" }}>
                    {u.email || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.groupId ? (
                      <Link
                        href={`/admin/management/groups/${u.groupId}`}
                        className="inline-flex items-center gap-1 hover:underline font-medium"
                        style={groupStyle(u.roleLabel)}
                      >
                        {u.groupName}
                        <ExternalLink size={12} />
                      </Link>
                    ) : (
                      <span className="font-medium" style={groupStyle(u.roleLabel)}>
                        {u.groupName}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-center">{u.lines}</td>
                  <td className="px-3 py-2.5 tabular-nums text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatLastLogin(u.lastLogin)}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: "var(--muted)" }}>
                    {u.ip ? <IpWithFlag ip={u.ip} /> : ""}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{u.credits}</td>
                  <td className="px-3 py-2.5 max-w-[8rem] truncate" style={{ color: "var(--muted)" }} title={u.notes}>
                    {u.notes}
                  </td>
                  <td className="px-3 py-2.5">
                    <ActionTrigger u={u} />
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
            <button type="button" className="xui-lines-action-backdrop" aria-label="Close menu" onClick={() => setOpenAction(null)} />
            <div
              ref={menuRef}
              className={`xui-lines-action-menu xui-lines-action-menu--portal ${flipped ? "xui-lines-action-menu--up" : ""}`}
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {panel === "admin" && (
                <Link
                  href={`/admin/resellers/${openRow.id}/edit`}
                  className="xui-lines-action-menu-item"
                  onClick={() => setOpenAction(null)}
                >
                  Edit user
                </Link>
              )}
              <Link
                href={`${linesHref}?owner=${encodeURIComponent(openRow.id)}`}
                className="xui-lines-action-menu-item"
                onClick={() => setOpenAction(null)}
              >
                View lines ({openRow.lines})
              </Link>
              {panel === "admin" && (
                <Link
                  href={`/admin/resellers/bouquets?userId=${encodeURIComponent(openRow.id)}`}
                  className="xui-lines-action-menu-item"
                  onClick={() => setOpenAction(null)}
                >
                  Manage bouquets
                </Link>
              )}
              <button type="button" className="xui-lines-action-menu-item" onClick={() => void toggleActive(openRow)}>
                {openRow.isActive ? "Disable user" : "Enable user"}
              </button>
              <button type="button" className="xui-lines-action-menu-item" onClick={() => void promptAddCredits(openRow)}>
                Add credits…
              </button>
              <button type="button" className="xui-lines-action-menu-item" onClick={() => void quickAddCredits(openRow, 10)}>
                +10 credits
              </button>
              <button type="button" className="xui-lines-action-menu-item" onClick={() => void quickAddCredits(openRow, 50)}>
                +50 credits
              </button>
              <Link
                href={`${creditsHref}?userId=${encodeURIComponent(openRow.id)}`}
                className="xui-lines-action-menu-item"
                onClick={() => setOpenAction(null)}
              >
                Credit history
              </Link>
              {panel === "admin" && openRow.role !== "ADMIN" && (
                <button type="button" className="xui-lines-action-menu-item" onClick={() => void promoteToAdmin(openRow)}>
                  Promote to admin
                </button>
              )}
              {panel === "admin" && openRow.role === "ADMIN" && (
                <button type="button" className="xui-lines-action-menu-item" onClick={() => void demoteToReseller(openRow)}>
                  Demote to reseller
                </button>
              )}
              {(panel === "reseller" || openRow.role !== "ADMIN") && (
                <button
                  type="button"
                  className="xui-lines-action-menu-item xui-lines-action-menu-item--danger"
                  onClick={() => void deleteUser(openRow.id, openRow.username)}
                >
                  Delete
                </button>
              )}
            </div>
          </>,
          document.body
        )}

      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t text-sm"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
      >
        <p style={{ color: "var(--muted)" }}>
          {total === 0
            ? "No entries"
            : `Showing ${start + 1} to ${Math.min(start + pageSize, total)} of ${total} entries${search ? " (filtered)" : ""}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            className="rounded px-3 py-1 border disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="tabular-nums">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            className="rounded px-3 py-1 border disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
