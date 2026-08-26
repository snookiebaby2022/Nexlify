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
  config?: { groupRole?: string };
  _count?: { users: number };
};

function typeLabel(g: Group) {
  const role = g.config?.groupRole;
  if (role === "admin") return "Administrator";
  if (role === "sub_reseller") return "Sub-reseller";
  if (role === "reseller") return "Reseller";
  return g.isReseller ? "Reseller" : "Administrator";
}

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
        Administrators, resellers, and sub-resellers. Permissions, packages, and menu modules are set per group.
      </p>
      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Users</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Actions</th>
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
                <td className="p-3">{typeLabel(g)}</td>
                <td className="p-3">{g._count?.users ?? 0}</td>
                <td className="p-3">{g.isBanned ? "Banned" : "Active"}</td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/management/groups/${g.id}`}
                      className="text-xs font-medium px-2 py-1 rounded border cursor-pointer"
                      style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="text-xs cursor-pointer"
                      style={{ color: "var(--danger)" }}
                      onClick={() => remove(g.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
