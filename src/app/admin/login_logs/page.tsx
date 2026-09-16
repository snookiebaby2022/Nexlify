"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { formatAuditAction } from "@/lib/audit-log";
import { formatLoginLogDetails } from "@/lib/log-display";
import { LogsPageToolbar } from "@/components/logs-page-toolbar";
import { DEFAULT_LOG_PAGE_SIZE } from "@/lib/log-page";

type LoginLogRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
  who?: string;
  user?: { username: string; role: string } | null;
  line?: { username: string } | null;
};

function displayUser(log: LoginLogRow): string {
  if (log.user?.username) return log.user.username;
  if (log.action.startsWith("iptv_line_login")) return "—";
  if (log.who && log.who !== "—") return log.who;
  return "—";
}

function displayLine(log: LoginLogRow): string {
  if (log.line?.username) return log.line.username;
  const m = log.meta && typeof log.meta === "object" ? (log.meta as Record<string, unknown>) : {};
  if (typeof m.lineUsername === "string" && m.lineUsername.trim()) return m.lineUsername.trim();
  if (log.action.startsWith("iptv_line_login") && typeof m.username === "string") return m.username.trim();
  return "—";
}

export default function LoginLogsPage() {
  const [logs, setLogs] = useState<LoginLogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(DEFAULT_LOG_PAGE_SIZE);
  const [clearBusy, setClearBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(pageSize) });
    params.set("action", "login");
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/logs?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [q, pageSize]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search applies on Refresh/Enter
  }, [pageSize]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Login Logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Panel admin/reseller logins and IPTV app authentication (player_api / M3U). Failed panel logins show the
          attempted username in User; IPTV lines appear under Line.
        </p>
      </div>

      <LogsPageToolbar
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRefresh={load}
        clearBusy={clearBusy}
        onClear={async () => {
          if (!confirm("Delete all login log entries matching this search? This cannot be undone.")) return;
          setClearBusy(true);
          try {
            const params = new URLSearchParams({ action: "login" });
            if (q.trim()) params.set("q", q.trim());
            await fetch(`/api/admin/logs?${params}`, { method: "DELETE" });
            load();
          } finally {
            setClearBusy(false);
          }
        }}
      >
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search user, line, IP, details..."
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
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium">Line</th>
              <th className="p-3 font-medium">Details</th>
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
                  No login logs found.
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <tr key={log.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="p-3">
                    <span className="font-medium">{formatAuditAction(log.action)}</span>
                    <span className="block text-xs font-mono" style={{ color: "var(--muted)" }}>
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3">
                    {displayUser(log)}
                    {log.user?.role ? (
                      <span className="block text-xs" style={{ color: "var(--muted)" }}>
                        {log.user.role}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3">{displayLine(log)}</td>
                  <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                    {formatLoginLogDetails(log)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
