"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { formatAuditAction, formatAuditMeta } from "@/lib/audit-log";

type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
  user?: { username: string; role: string } | null;
  line?: { username: string } | null;
};

export default function ManagementLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (q) params.set("q", q);
    params.set("limit", "200");
    fetch(`/api/admin/logs?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setLoading(false);
      });
  }, [action, q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Panel actions with user, line, and detail metadata.
      </p>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Filter action (e.g. create_line)"
          className="rounded border px-3 py-2 bg-transparent text-sm min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <input
          placeholder="Search user, line, entity…"
          className="rounded border px-3 py-2 bg-transparent text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          onClick={load}
          className="rounded px-4 py-2 text-sm cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Refresh
        </button>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium">Line</th>
              <th className="p-3 font-medium">Target</th>
              <th className="p-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => {
                const meta = formatAuditMeta(log.meta);
                return (
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
                      {log.user ? (
                        <>
                          {log.user.username}
                          <span className="block text-xs" style={{ color: "var(--muted)" }}>
                            {log.user.role}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">{log.line?.username ?? "—"}</td>
                    <td className="p-3">
                      {log.entity ? (
                        <>
                          {log.entity}
                          {log.entityId && (
                            <span className="block text-xs font-mono truncate max-w-[140px]" style={{ color: "var(--muted)" }}>
                              {log.entityId}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                      {meta ?? "—"}
                    </td>
                  </tr>
                );
              })}
            {!loading && !logs.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No log entries match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
