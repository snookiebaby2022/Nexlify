"use client";

import { useEffect, useState } from "react";
import { LogsPageToolbar } from "@/components/logs-page-toolbar";
import { DEFAULT_LOG_PAGE_SIZE } from "@/lib/log-page";

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
  const [pageSize, setPageSize] = useState(DEFAULT_LOG_PAGE_SIZE);
  const [clearBusy, setClearBusy] = useState(false);

  function load() {
    fetch(`/api/admin/leak-audit?limit=${pageSize}`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [pageSize]);

  return (
    <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
      <h2 className="text-lg font-semibold">Stream leak audit log</h2>
      <LogsPageToolbar
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRefresh={load}
        clearBusy={clearBusy}
        onClear={async () => {
          if (!confirm("Delete all leak audit log entries? This cannot be undone.")) return;
          setClearBusy(true);
          try {
            await fetch("/api/admin/leak-audit?all=1", { method: "DELETE" });
            load();
          } finally {
            setClearBusy(false);
          }
        }}
      />
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
