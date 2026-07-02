"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type RtmpRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  appName: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  serverCount: number;
};

export default function RtmpMonitorPage() {
  const [endpoints, setEndpoints] = useState<RtmpRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/rtmp-monitor")
      .then((r) => r.json())
      .then((d) => {
        setEndpoints(d.endpoints ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">RTMP Monitor</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Live RTMP publish endpoints and their status. Monitor active RTMP streams across servers.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
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
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Host</th>
              <th className="p-3 font-medium">Port</th>
              <th className="p-3 font-medium">App Name</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Servers</th>
              <th className="p-3 font-medium">Notes</th>
              <th className="p-3 font-medium">Created</th>
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
            {!loading && endpoints.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No RTMP endpoints configured.
                </td>
              </tr>
            )}
            {!loading &&
              endpoints.map((ep) => (
                <tr key={ep.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3 font-medium">{ep.name}</td>
                  <td className="p-3 font-mono text-xs">{ep.host}</td>
                  <td className="p-3 font-mono text-xs">{ep.port}</td>
                  <td className="p-3 font-mono text-xs">{ep.appName ?? "live"}</td>
                  <td className="p-3">
                    <span className={`xui-pill xui-pill--${ep.isActive ? "yes" : "no"}`}>
                      {ep.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="p-3">{ep.serverCount}</td>
                  <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                    {ep.notes ?? "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(ep.createdAt)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
