"use client";

import { useCallback, useEffect, useState } from "react";

type SyncRow = {
  id: string;
  key: string;
  lastSyncError: string | null;
  pendingSyncAction: string | null;
  panelUrl: string | null;
  panelHost: string | null;
  user: { email: string };
};

export function AdminSyncQueue() {
  const [rows, setRows] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/licenses?syncErrors=1&pageSize=100")
      .then((r) => r.json())
      .then((d) => setRows(d.licenses ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(id: string) {
    setBusyId(id);
    await fetch("/api/admin/licenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, activatePanel: true }),
    });
    setBusyId(null);
    load();
  }

  if (loading) return <p className="text-sm text-slate-400">Loading failed syncs…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Licenses with a last sync error or a pending push. Retry uses the stored panel URL and API secret.
      </p>
      {rows.length === 0 ? (
        <p className="text-slate-500">No failed or pending panel syncs.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Panel</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/80">
                  <td className="px-4 py-3">
                    <div className="text-white">{r.user.email}</div>
                    <div className="font-mono text-[10px] text-cyan-300">{r.key}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.panelUrl || r.panelHost || "—"}</td>
                  <td className="px-4 py-3 text-amber-200">
                    {r.lastSyncError || (r.pendingSyncAction ? `pending ${r.pendingSyncAction}` : "—")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busyId === r.id || !r.panelUrl}
                      onClick={() => void retry(r.id)}
                      className="text-xs text-violet-400 hover:underline disabled:opacity-40"
                    >
                      Retry push
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
