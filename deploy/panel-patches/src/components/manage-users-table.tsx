"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, ExternalLink, List } from "lucide-react";
import { IpWithFlag } from "@/components/ip-with-flag";

export type ManageUserRow = {
  id: string;
  displayId: number;
  username: string;
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
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("displayId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openAction, setOpenAction] = useState<string | null>(null);

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
    const res = await fetch(url, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) alert(j.error ?? "Delete failed");
    else onRefresh();
    setOpenAction(null);
  }

  async function toggleActive(u: ManageUserRow) {
    await fetch(usersApi, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, isActive: !u.isActive }),
    });
    onRefresh();
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

  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)",
        }}
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
            <article key={u.id} className="panel-mobile-card p-4 space-y-2.5 relative">
              <div className="flex items-start justify-between gap-2">
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
                    {u.email || "No email"}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded px-2 py-1.5 border cursor-pointer hover:bg-white/10 shrink-0"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => setOpenAction(openAction === u.id ? null : u.id)}
                  aria-label="Actions"
                >
                  <List size={16} />
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    Role / group
                  </dt>
                  <dd className="font-medium truncate" style={groupStyle(u.roleLabel)}>
                    {u.groupName}
                  </dd>
                </div>
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
                {typeof u.subUsers === "number" ? (
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                      Sub-users
                    </dt>
                    <dd className="tabular-nums">{u.subUsers}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    Owner
                  </dt>
                  <dd className="truncate">{u.owner ?? "—"}</dd>
                </div>
                {u.lastLogin ? (
                  <div className="col-span-2">
                    <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                      Last login
                    </dt>
                    <dd className="text-xs tabular-nums">{formatLastLogin(u.lastLogin)}</dd>
                  </div>
                ) : null}
                {u.ip ? (
                  <div className="col-span-2">
                    <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                      IP
                    </dt>
                    <dd>
                      <IpWithFlag ip={u.ip} />
                    </dd>
                  </div>
                ) : null}
              </dl>
              {openAction === u.id && (
                <div
                  className="absolute right-4 top-12 z-20 py-1 rounded shadow-xl min-w-[10rem] border text-sm"
                  style={{ background: "#252a2f", borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                    onClick={() => toggleActive(u)}
                  >
                    {u.isActive ? "Disable user" : "Enable user"}
                  </button>
                  <Link
                    href={`${creditsHref}?userId=${u.id}`}
                    className="block px-3 py-2 hover:bg-white/10"
                    onClick={() => setOpenAction(null)}
                  >
                    {panel === "reseller" ? "Add credits" : "Credit log"}
                  </Link>
                  {panel === "reseller" && (
                    <>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                        onClick={() => void quickAddCredits(u, 10)}
                      >
                        +10 credits
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                        onClick={() => void quickAddCredits(u, 50)}
                      >
                        +50 credits
                      </button>
                    </>
                  )}
                  {u.role !== "ADMIN" && (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                      style={{ color: "var(--danger)" }}
                      onClick={() => deleteUser(u.id, u.username)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              <SortHead label="ID" col="displayId" />
              <th className="px-3 py-3 text-left font-normal text-xs">Status</th>
              <SortHead label="Owner" col="owner" />
              <SortHead label="Name" col="username" />
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
                <td colSpan={12} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                  No users found
                </td>
              </tr>
            ) : (
              pageRows.map((u) => (
                <tr
                  key={u.id}
                  className="border-b hover:bg-white/[0.03]"
                  style={{ borderColor: "var(--border)" }}
                >
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
                      <span className="inline-flex items-center gap-1 font-medium" style={groupStyle(u.roleLabel)}>
                        {u.groupName}
                        <ExternalLink size={12} className="opacity-40" />
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
                  <td className="px-3 py-2.5 relative">
                    <button
                      type="button"
                      className="rounded px-2 py-1.5 border cursor-pointer hover:bg-white/10"
                      style={{ borderColor: "var(--border)" }}
                      onClick={() => setOpenAction(openAction === u.id ? null : u.id)}
                      aria-label="Actions"
                    >
                      <List size={16} />
                    </button>
                    {openAction === u.id && (
                      <div
                        className="absolute right-3 top-full z-20 mt-1 py-1 rounded shadow-xl min-w-[10rem] border text-sm"
                        style={{ background: "#252a2f", borderColor: "var(--border)" }}
                      >
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? "Disable user" : "Enable user"}
                        </button>
                        <Link
                          href={`${creditsHref}?userId=${u.id}`}
                          className="block px-3 py-2 hover:bg-white/10"
                          onClick={() => setOpenAction(null)}
                        >
                          {panel === "reseller" ? "Add credits" : "Credit log"}
                        </Link>
                        {panel === "reseller" && (
                          <>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                              onClick={() => void quickAddCredits(u, 10)}
                            >
                              +10 credits
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                              onClick={() => void quickAddCredits(u, 50)}
                            >
                              +50 credits
                            </button>
                          </>
                        )}
                        {(panel === "reseller" || u.role !== "ADMIN") && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer"
                            style={{ color: "var(--danger)" }}
                            onClick={() => deleteUser(u.id, u.username)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let n = i + 1;
            if (totalPages > 7) {
              if (safePage <= 4) n = i + 1;
              else if (safePage >= totalPages - 3) n = totalPages - 6 + i;
              else n = safePage - 3 + i;
            }
            return (
              <button
                key={n}
                type="button"
                className="rounded px-3 py-1 border min-w-[2rem] cursor-pointer"
                style={{
                  borderColor: "var(--border)",
                  background: n === safePage ? "rgba(0,192,239,0.35)" : "transparent",
                }}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            );
          })}
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
