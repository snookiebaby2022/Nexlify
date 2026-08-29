"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListPagination } from "@/components/list-pagination";

const PAGE_SIZES = [10, 25, 50, 100] as const;

type User = {
  id: string;
  username: string;
  role: string;
  credits: number;
  maxLines: number;
  isActive: boolean;
  groupId: string | null;
  groupName: string;
  email?: string | null;
};

type GroupOption = {
  id: string;
  name: string;
  isReseller: boolean;
};

export default function MassEditUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("setGroup");
  const [credits, setCredits] = useState(10);
  const [maxLines, setMaxLines] = useState(500);
  const [groupId, setGroupId] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");

  function reloadUsers() {
    return fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.resellers ?? d.users ?? []).filter(
          (u: User & { role: string }) => u.role !== "ADMIN"
        );
        setUsers(list);
      });
  }

  useEffect(() => {
    void reloadUsers();
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.groups ?? []) as GroupOption[];
        setGroups(list);
        const preferred =
          list.find((g) => g.name === "Resellers") ??
          list.find((g) => g.isReseller) ??
          list[0];
        if (preferred) setGroupId(preferred.id);
      });
  }, []);

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter === "RESELLER") list = list.filter((u) => u.role === "RESELLER");
    else if (roleFilter === "SUB_RESELLER") list = list.filter((u) => u.role === "SUB_RESELLER");
    if (groupFilter) list = list.filter((u) => u.groupId === groupFilter);
    if (statusFilter === "active") list = list.filter((u) => u.isActive);
    if (statusFilter === "inactive") list = list.filter((u) => !u.isActive);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.groupName ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
    );
  }, [users, search, roleFilter, groupFilter, statusFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );
  const allOnPageSelected = paged.length > 0 && paged.every((u) => selected.has(u.id));

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  }

  function toggleAll() {
    const n = new Set(selected);
    if (allOnPageSelected) paged.forEach((u) => n.delete(u.id));
    else paged.forEach((u) => n.add(u.id));
    setSelected(n);
  }

  function selectAll() {
    setSelected(new Set(filtered.map((u) => u.id)));
  }

  async function apply() {
    if (!selected.size || busy) return;
    if (action === "setGroup" && !groupId) {
      setMsg("Choose a group");
      return;
    }
    if (action === "delete" && !confirm(`Delete ${selected.size} user(s)? This cannot be undone.`)) return;

    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/users/mass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          action,
          credits,
          maxLines,
          groupId: action === "setGroup" ? groupId : undefined,
        }),
      });
      const data = await res.json();
      setMsg(res.ok ? `Updated ${data.count} users` : data.error || "Failed");
      setSelected(new Set());
      await reloadUsers();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <h1 className="text-2xl font-semibold flex-1">Mass edit — users</h1>
        <Link href="/admin/management/mass-edit" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Mass edit
        </Link>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Filter by role, group, or status. Bulk change group, enable/disable, add or deduct credits, set credit balance, set max lines, or delete resellers.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
          Action
          <select
            className="rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)", color: "inherit" }}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="setGroup">Change group</option>
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
            <option value="addCredits">Add credits</option>
            <option value="deductCredits">Deduct credits</option>
            <option value="setCredits">Set credits (exact)</option>
            <option value="setMaxLines">Set max lines</option>
            <option value="delete">Delete users</option>
          </select>
        </label>
        {action === "setGroup" && (
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
            Group
            <select
              className="rounded border px-3 py-2 bg-transparent text-sm min-w-[12rem]"
              style={{ borderColor: "var(--border)", color: "inherit" }}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Select group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
        )}
        {(action === "addCredits" || action === "deductCredits" || action === "setCredits") && (
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
            Credits
            <input
              type="number"
              min={0}
              className="rounded border px-3 py-2 bg-transparent w-24 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={credits}
              onChange={(e) => setCredits(parseInt(e.target.value, 10) || 0)}
            />
          </label>
        )}
        {action === "setMaxLines" && (
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
            Max lines
            <input
              type="number"
              min={0}
              className="rounded border px-3 py-2 bg-transparent w-24 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={maxLines}
              onChange={(e) => setMaxLines(parseInt(e.target.value, 10) || 0)}
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || !selected.size}
          className="rounded px-4 py-2 cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Apply to {selected.size || "…"} selected
        </button>
      </div>

      {msg && <p className="text-sm">{msg}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search users…"
          className="rounded border px-3 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="rounded border px-2 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)", color: "inherit" }}
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
            setSelected(new Set());
          }}
        >
          <option value="all">All roles</option>
          <option value="RESELLER">Resellers</option>
          <option value="SUB_RESELLER">Sub-resellers</option>
        </select>
        <select
          className="rounded border px-2 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)", color: "inherit" }}
          value={groupFilter}
          onChange={(e) => {
            setGroupFilter(e.target.value);
            setPage(1);
            setSelected(new Set());
          }}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select
          className="rounded border px-2 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)", color: "inherit" }}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
            setSelected(new Set());
          }}
        >
          <option value="all">All status</option>
          <option value="active">Active only</option>
          <option value="inactive">Disabled only</option>
        </select>
        <select
          className="rounded border px-2 py-1.5 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} entries</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {selected.size} selected · {filtered.length} total
        </span>
        {selected.size < filtered.length && filtered.length > 0 && (
          <button
            type="button"
            onClick={selectAll}
            className="text-xs px-2 py-1 rounded border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
          >
            Select all {filtered.length}
          </button>
        )}
      </div>

      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} />
              </th>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Group</th>
              <th className="text-left p-3">Credits</th>
              <th className="text-left p-3">Max lines</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                </td>
                <td className="p-3">{u.username}</td>
                <td className="p-3">{u.role === "SUB_RESELLER" ? "Sub-reseller" : "Reseller"}</td>
                <td className="p-3">{u.groupName || "—"}</td>
                <td className="p-3">{u.credits}</td>
                <td className="p-3">{u.maxLines ?? "—"}</td>
                <td className="p-3">{u.isActive ? "Active" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListPagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        noun="users"
      />
    </div>
  );
}
