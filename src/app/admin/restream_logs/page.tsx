"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type RestreamLogRow = {
  id: string;
  lineId: string | null;
  streamId: string | null;
  ip: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  action: string;
  meta: unknown;
  createdAt: string;
  lineUsername?: string;
  streamName?: string;
};

export default function RestreamLogsPage() {
  const [logs, setLogs] = useState<RestreamLogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/restream-logs?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setLoading(false);
      });
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Restream Detection Logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Detected restream and leak events. Tracks unauthorized redistribution attempts.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search IP, fingerprint, action..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button
          type="button"
          onClick={load}
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Search
        </button>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Line</th>
              <th className="p-3 font-medium">Stream</th>
              <th className="p-3 font-medium">IP</th>
              <th className="p-3 font-medium">User-Agent</th>
              <th className="p-3 font-medium">Fingerprint</th>
              <th className="p-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No restream logs found.
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
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{log.lineUsername ?? log.lineId?.slice(0, 8) ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{log.streamName ?? log.streamId?.slice(0, 8) ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{log.ip ?? "—"}</td>
                  <td className="p-3 text-xs truncate max-w-[160px]" style={{ color: "var(--muted)" }} title={log.userAgent ?? ""}>
                    {log.userAgent ?? "—"}
                  </td>
                  <td className="p-3 font-mono text-xs truncate max-w-[120px]" title={log.fingerprint ?? ""}>
                    {log.fingerprint ?? "—"}
                  </td>
                  <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                    {log.meta ? (
                      <code className="break-all">{JSON.stringify(log.meta).slice(0, 80)}</code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
