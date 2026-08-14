"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const PAGE_SIZES = [10, 25, 50, 100] as const;

type User = {
  id: string;
  username: string;
  role: string;
  credits: number;
  isActive: boolean;
};

export default function MassEditUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("disable");
  const [credits, setCredits] = useState(10);
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) => setUsers((d.resellers ?? []).filter((u: User) => u.role !== "ADMIN")));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) => u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const allOnPageSelected = paged.length > 0 && paged.every((u) => selected.has(u.id));

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
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
    if (!selected.size) return;
    const res = await fetch("/api/admin/users/mass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action, credits }),
    });
    const data = await res.json();
    setMsg(res.ok ? `Updated ${data.count} users` : data.error);
    setSelected(new Set());
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) => setUsers((d.resellers ?? []).filter((u: User) => u.role !== "ADMIN")));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <h1 className="text-2xl font-semibold flex-1">Mass edit — users</h1>
        <Link href="/admin/management/mass-edit" className="text-sm" style={{ color: "var(--accent)" }}>← Mass edit</Link>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <select className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="enable">Enable</option>
          <option value="disable">Disable</option>
          <option value="addCredits">Add credits</option>
        </select>
        {action === "addCredits" && (
          <input type="number" className="rounded border px-3 py-2 bg-transparent w-24" style={{ borderColor: "var(--border)" }} value={credits} onChange={(e) => setCredits(parseInt(e.target.value, 10))} />
        )}
        <button type="button" onClick={apply} className="rounded px-4 py-2 cursor-pointer" style={{ background: "var(--accent)", color: "#fff" }}>
          Apply to {selected.size || "…"} selected
        </button>
      </div>

      {msg && <p className="text-sm">{msg}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <input type="search" placeholder="Search users…" className="rounded border px-3 py-1.5 text-sm bg-transparent" style={{ borderColor: "var(--border)" }} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="rounded border px-2 py-1.5 text-sm bg-transparent" style={{ borderColor: "var(--border)" }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} entries</option>)}
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{selected.size} selected · {filtered.length} total</span>
        {selected.size < filtered.length && (
          <button type="button" onClick={selectAll} className="text-xs px-2 py-1 rounded border cursor-pointer" style={{ borderColor: "var(--border)" }}>Select all {filtered.length}</button>
        )}
      </div>

      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10"><input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} /></th>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Credits</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3"><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /></td>
                <td className="p-3">{u.username}</td>
                <td className="p-3">{u.role}</td>
                <td className="p-3">{u.credits}</td>
                <td className="p-3">{u.isActive ? "Active" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--muted)" }}>Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage(1)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>«</button>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>‹</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>›</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="px-2 py-1 rounded border cursor-pointer disabled:opacity-40" style={{ borderColor: "var(--border)" }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
