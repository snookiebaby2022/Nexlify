"use client";

import { useEffect, useState } from "react";

type LogRow = {
  id: string;
  lineId: string | null;
  streamId: string | null;
  ip: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  action: string;
  createdAt: string;
};

export function LeakAuditPanel() {
  const [logs, setLogs] = useState<LogRow[]>([]);

  function load() {
    fetch("/api/admin/leak-audit?limit=50")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function purge() {
    if (!confirm("Delete logs older than retention setting?")) return;
    await fetch("/api/admin/leak-audit", { method: "DELETE" });
    load();
  }

  return (
    <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Stream leak audit log</h2>
        <button
          type="button"
          onClick={purge}
          className="text-xs rounded border px-2 py-1 cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          Purge old entries
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Line</th>
              <th className="text-left p-2">IP</th>
              <th className="text-left p-2">Fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-2 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="p-2">{l.action}</td>
                <td className="p-2 font-mono">{l.lineId?.slice(0, 8) ?? "—"}</td>
                <td className="p-2">{l.ip ?? "—"}</td>
                <td className="p-2 font-mono">{l.fingerprint ?? "—"}</td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={5} className="p-4 text-center" style={{ color: "var(--muted)" }}>
                  No leak audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
