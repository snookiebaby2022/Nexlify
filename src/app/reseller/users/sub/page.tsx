"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

type SubUser = {
  id: string;
  username: string;
  email: string;
  credits: number;
  lines: number;
  subUsers?: number;
  isActive: boolean;
  groupName: string;
  createdAt?: string;
  lastLogin: string;
};

export default function ResellerSubResellersPage() {
  const [users, setUsers] = useState<SubUser[]>([]);

  useEffect(() => {
    fetch("/api/reseller/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My sub-users</h1>
        <Link href="/reseller/users/add" className="text-sm px-3 py-2 rounded-md font-medium" style={{ background: "var(--accent)", color: "#fff" }}>
          + Add user
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {users.map((u) => (
          <article
            key={u.id}
            className="rounded-xl border p-5 space-y-3"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-lg">{u.username}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {u.email || "No email"}
                </p>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: u.isActive ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.2)",
                  color: u.isActive ? "#22c55e" : "var(--muted)",
                }}
              >
                {u.isActive ? "Active" : "Disabled"}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Credits
                </dt>
                <dd className="font-semibold tabular-nums">{u.credits}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Lines
                </dt>
                <dd className="font-semibold tabular-nums">{u.lines}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Group
                </dt>
                <dd className="truncate">{u.groupName}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Last activity
                </dt>
                <dd className="text-xs tabular-nums">{formatDate(u.lastLogin)}</dd>
              </div>
            </dl>

            {u.createdAt && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Created {formatDate(u.createdAt)}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={`/reseller/users/credits?userId=${u.id}`}
                className="text-xs px-3 py-1.5 rounded border hover:bg-white/5"
                style={{ borderColor: "var(--border)" }}
              >
                Add credits
              </Link>
              <Link href="/reseller/users" className="text-xs px-3 py-1.5 rounded border hover:bg-white/5" style={{ borderColor: "var(--border)" }}>
                Manage
              </Link>
            </div>
          </article>
        ))}
      </div>

      {users.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: "var(--muted)" }}>
          No sub-resellers yet.{" "}
          <Link href="/reseller/users/add" style={{ color: "var(--accent)" }}>
            Add your first user
          </Link>
        </p>
      )}
    </div>
  );
}
