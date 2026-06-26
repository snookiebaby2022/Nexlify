"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

  useEffect(() => {
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) => setUsers((d.resellers ?? []).filter((u: User) => u.role !== "ADMIN")));
  }, []);

  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
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
          Apply
        </button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3" />
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Credits</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
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
    </div>
  );
}
