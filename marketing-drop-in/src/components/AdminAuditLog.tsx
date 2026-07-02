"use client";

import { useCallback, useEffect, useState } from "react";

type AuditRow = {
  id: string;
  userId: string | null;
  email: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
};

const ACTION_COLORS: Record<string, string> = {
  login: "text-green-400",
  logout: "text-slate-400",
  settings_update: "text-violet-400",
  deploy: "text-cyan-400",
  blog_create: "text-emerald-400",
  blog_update: "text-amber-400",
  blog_delete: "text-red-400",
  license_create: "text-blue-400",
  license_update: "text-blue-300",
  license_delete: "text-red-400",
};

export function AdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (filter) params.set("action", filter);
    fetch(`/api/admin/audit?${params}`)
      .then((r) => r.json())
      .then((d) => { setRows(d.rows || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">Audit Log</h2>
        <span className="text-sm text-slate-400">{total} entries</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {["", "login", "settings_update", "deploy", "blog_create", "blog_update", "blog_delete", "license_create", "license_update"].map((a) => (
          <button key={a} onClick={() => { setFilter(a); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === a ? "bg-violet-600 text-white" : "border border-slate-700 text-slate-400 hover:text-white"}`}>
            {a || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={ACTION_COLORS[r.action] || "text-slate-300"}>{r.action}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.detail || "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No audit entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:text-white disabled:opacity-40">Prev</button>
          <span className="px-3 py-1 text-sm text-slate-400">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={rows.length < 50}
            className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:text-white disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
