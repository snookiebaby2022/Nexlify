"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { LogsPageToolbar } from "@/components/logs-page-toolbar";
import { DEFAULT_LOG_PAGE_SIZE } from "@/lib/log-page";

type SyslogRow = {
  id: string;
  job: string;
  status: string;
  message: string | null;
  durationMs: number | null;
  createdAt: string;
};

export default function MysqlSyslogPage() {
  const [logs, setLogs] = useState<SyslogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(DEFAULT_LOG_PAGE_SIZE);
  const [clearBusy, setClearBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/mysql-syslog?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setLoading(false);
      });
  }, [q, pageSize]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search applies on Refresh/Enter
  }, [pageSize]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">MySQL Syslog</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Database operation logs and cron run history. Shows scheduled job execution with timing and status.
        </p>
      </div>

      <LogsPageToolbar
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRefresh={load}
        clearBusy={clearBusy}
        onClear={async () => {
          if (!confirm("Delete all MySQL syslog / cron run entries? This cannot be undone.")) return;
          setClearBusy(true);
          try {
            await fetch("/api/admin/mysql-syslog", { method: "DELETE" });
            load();
          } finally {
            setClearBusy(false);
          }
        }}
      >
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search job name, status, message..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
      </LogsPageToolbar>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium">Job</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Duration</th>
              <th className="p-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No syslog entries found.
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <tr key={log.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="p-3 font-medium">{log.job}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                      background: log.status === "ok" ? "rgba(34,197,94,0.15)" : log.status === "error" ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)",
                      color: log.status === "ok" ? "#22c55e" : log.status === "error" ? "#ef4444" : "#eab308",
                    }}>
                      {log.status}
                    </span>
                  </td>
                  <td className="p-3 tabular-nums text-xs" style={{ color: "var(--muted)" }}>
                    {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                  </td>
                  <td className="p-3 text-xs truncate max-w-[300px]" style={{ color: "var(--muted)" }} title={log.message ?? ""}>
                    {log.message ?? "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
