"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type ClientLogRow = {
  id: string;
  lineId: string;
  lineUsername: string;
  streamName: string | null;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeenAt: string;
};

export default function ClientLogsPage() {
  const [logs, setLogs] = useState<ClientLogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(50);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/connections?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const conns = (d.connections ?? []).map((c: { id: string; line: { username: string }; stream: { name: string } | null; ip: string | null; userAgent: string | null; startedAt: string; lastSeenAt: string }) => ({
          id: c.id,
          lineId: "",
          lineUsername: c.line?.username ?? "—",
          streamName: c.stream?.name ?? null,
          ip: c.ip ?? null,
          userAgent: c.userAgent ?? null,
          startedAt: c.startedAt,
          lastSeenAt: c.lastSeenAt,
        }));
        setLogs(conns);
        setLoading(false);
      });
  }, [q, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Client Logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Player and app client connection history. Shows recent active sessions with user-agent and stream info.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search line, IP, user-agent..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[25, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={load}
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Refresh
        </button>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
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
                <td colSpan={6} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No client logs found.
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <tr key={log.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3 font-medium">{log.lineUsername}</td>
                  <td className="p-3">{log.streamName ?? "—"}</td>
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
