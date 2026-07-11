"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/format";

type UserSummary = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  trialBypass: boolean;
  createdAt: string;
  licenseCount: number;
  ticketCount: number;
};

type UserDetail = UserSummary & {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  licenses: {
    id: string;
    key: string;
    status: string;
    plan: string;
    expiresAt: string | null;
  }[];
  recentOrders: {
    id: string;
    plan: string;
    status: string;
    amountCents: number;
    createdAt: string;
  }[];
};

export function AdminUsers() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);

  async function lookup(email: string) {
    setSelectedEmail(email);
    setError(null);
    setUser(null);
    setMessage(null);
    setLoading(true);
    const res = await fetch(`/api/admin/users?email=${encodeURIComponent(email)}`);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Lookup failed");
      return;
    }
    const data = await res.json();
    setUser(data.user);
  }

  async function patch(body: Record<string, unknown>) {
    if (!user) return;
    setMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, ...body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Update failed");
      return;
    }
    if (body.resetTrial) {
      setMessage(`Reset trial eligibility (${data.deletedTrialLicenses ?? 0} licenses removed)`);
      const refresh = await fetch(`/api/admin/users?email=${encodeURIComponent(user.email)}`);
      if (refresh.ok) {
        const refreshed = await refresh.json();
        setUser(refreshed.user);
      }
      return;
    }
    setUser((u) => (u ? { ...u, ...data.user } : u));
    setMessage("User updated");
  }

  const filtered = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (user) {
    return (
      <div className="space-y-6 max-w-3xl">
        <button
          type="button"
          onClick={() => { setUser(null); setSelectedEmail(""); }}
          className="text-sm text-violet-400 hover:underline"
        >
          ← Back to users
        </button>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {message && <p className="text-cyan-400 text-sm">{message}</p>}

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
          <div>
            <h2 className="font-display text-xl text-white">{user.email}</h2>
            {user.name && <p className="text-slate-400">{user.name}</p>}
            <p className="mt-2 text-sm text-slate-500">
              Joined {formatDate(user.createdAt)} · Role:{" "}
              <span className="text-violet-300">{user.role}</span>
              {user.trialBypass && (
                <span className="ml-2 text-emerald-400">· Trial bypass on</span>
              )}
            </p>
            {(user.utmSource || user.utmCampaign) && (
              <p className="mt-1 text-xs text-slate-500">
                UTM: {user.utmSource ?? "—"} / {user.utmMedium ?? "—"} /{" "}
                {user.utmCampaign ?? "—"}
              </p>
            )}
            <p className="text-xs text-slate-500">{user.ticketCount} support tickets</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {user.role !== "ADMIN" ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Promote ${user.email} to admin?`)) patch({ role: "ADMIN" });
                }}
                className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
              >
                Promote to admin
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Demote ${user.email} to user?`)) patch({ role: "USER" });
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              >
                Demote to user
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete trial licenses and allow a new trial?"))
                  patch({ resetTrial: true });
              }}
              className="rounded-lg border border-violet-500/40 px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/10"
            >
              Reset trial eligibility
            </button>
            <button
              type="button"
              onClick={() => patch({ trialBypass: !user.trialBypass })}
              className="rounded-lg border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10"
            >
              {user.trialBypass ? "Disable trial bypass" : "Enable trial bypass"}
            </button>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-2">Licenses</h3>
            <ul className="space-y-2 text-sm">
              {user.licenses.length === 0 ? (
                <li className="text-slate-500">None</li>
              ) : (
                user.licenses.map((l) => (
                  <li
                    key={l.id}
                    className="rounded-lg border border-slate-800 px-3 py-2 font-mono text-xs"
                  >
                    <span className="text-cyan-300">{l.key}</span> · {l.plan} · {l.status} ·{" "}
                    {formatDate(l.expiresAt)}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-2">Recent orders</h3>
            <ul className="space-y-1 text-sm text-slate-400">
              {user.recentOrders.length === 0 ? (
                <li>None</li>
              ) : (
                user.recentOrders.map((o) => (
                  <li key={o.id}>
                    {o.plan} · {o.status} · {formatDate(o.createdAt)}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search users by email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white"
        />
      </div>

      {loading && <p className="text-slate-400 text-sm">Loading…</p>}

      {filtered.length === 0 ? (
        <p className="text-slate-500">No users found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Licenses</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-white font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-slate-300">{u.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "ADMIN" ? "bg-amber-500/20 text-amber-300" : "bg-slate-700 text-slate-300"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.licenseCount}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => lookup(u.email)}
                      className="text-xs text-violet-400 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
