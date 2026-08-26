"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { LogsPageToolbar } from "@/components/logs-page-toolbar";
import { DEFAULT_LOG_PAGE_SIZE } from "@/lib/log-page";

type ClientLogRow = {
  id: string;
  lineId: string;
  lineUsername: string;
  streamName: string | null;
  streamType: string | null;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeenAt: string;
  active: boolean;
};

export default function ClientLogsPage() {
  const [logs, setLogs] = useState<ClientLogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(DEFAULT_LOG_PAGE_SIZE);
  const [clearBusy, setClearBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/client-logs?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [q, pageSize]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Client Logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          IPTV player sessions (last 24h). Active sessions refresh every 15s.
        </p>
      </div>

      <LogsPageToolbar
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRefresh={load}
        clearBusy={clearBusy}
        clearLabel="Clear ended"
        onClear={async () => {
          if (!confirm("Remove ended client sessions from this list? Live viewers stay connected.")) return;
          setClearBusy(true);
          try {
            await fetch("/api/admin/client-logs", { method: "DELETE" });
            load();
          } finally {
            setClearBusy(false);
          }
        }}
      >
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search line, stream, IP, user-agent..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <Link href="/admin/line_activity" className="rounded-lg px-4 py-2 text-sm border" style={{ borderColor: "var(--border)" }}>
          Line activity
        </Link>
      </LogsPageToolbar>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Line</th>
              <th className="p-3 font-medium">Stream</th>
              <th className="p-3 font-medium">IP</th>
              <th className="p-3 font-medium">User-Agent</th>
              <th className="p-3 font-medium">Started</th>
              <th className="p-3 font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No client logs in the last 24 hours.
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <tr key={log.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{
                        background: log.active ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
                        color: log.active ? "#22c55e" : "var(--muted)",
                      }}
                    >
                      {log.active ? "Live" : "Ended"}
                    </span>
                  </td>
                  <td className="p-3 font-medium">{log.lineUsername}</td>
                  <td className="p-3">
                    {log.streamName ?? "—"}
                    {log.streamType ? (
                      <span className="block text-xs" style={{ color: "var(--muted)" }}>
                        {log.streamType}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3 font-mono text-xs">{log.ip ?? "—"}</td>
                  <td className="p-3 text-xs truncate max-w-[200px]" style={{ color: "var(--muted)" }} title={log.userAgent ?? ""}>
                    {log.userAgent ?? "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(log.startedAt)}
                  </td>
                  <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(log.lastSeenAt)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
