"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type LoginLogRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
  user?: { username: string; role: string } | null;
  line?: { username: string } | null;
};

export default function LoginLogsPage() {
  const [logs, setLogs] = useState<LoginLogRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    params.set("action", "login");
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/logs?${params}`)
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
        <h1 className="text-2xl font-semibold">Login Logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Panel login attempts and authentication events.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search user, IP, details..."
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
                    <span className="font-medium">{log.action}</span>
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
                  <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                    {log.meta ? (
                      <code className="break-all">{JSON.stringify(log.meta).slice(0, 120)}</code>
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
