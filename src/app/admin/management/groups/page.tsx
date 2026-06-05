"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Group = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isReseller: boolean;
  isBanned: boolean;
  _count?: { users: number };
};

export default function ManagementGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);

  function load() {
    fetch("/api/admin/groups").then((r) => r.json()).then((d) => setGroups(d.groups ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this group?")) return;
    await fetch(`/api/admin/groups?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">Manage groups</h1>
        <Link
          href="/admin/management/groups/add"
          className="text-sm px-3 py-2 rounded-md"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          + Add group
        </Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Reseller groups with permissions, trial limits, and credit rules (XUI-style).
      </p>
      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Users</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <Link href={`/admin/management/groups/${g.id}`} className="flex items-center gap-2 hover:underline" style={{ color: "var(--accent)" }}>
                    <span
                      className="w-3 h-3 rounded shrink-0"
                      style={{ background: g.color ?? "#e85d4c" }}
                    />
                    {g.name}
                  </Link>
                </td>
                <td className="p-3">{g.isReseller ? "Reseller" : "User"}</td>
                <td className="p-3">{g._count?.users ?? 0}</td>
                <td className="p-3">{g.isBanned ? "Banned" : "Active"}</td>
                <td className="p-3">
                  <button type="button" className="text-xs cursor-pointer" style={{ color: "var(--danger)" }} onClick={() => remove(g.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
