"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

type Row = {
  id: string;
  status: string;
  pid: number | null;
  cpuPercent: number | null;
  memoryMb: number | null;
  stale: boolean;
  lastSeenAt: string;
  server: { id: string; name: string; agentLastSeen: string | null };
  stream: { id: string; name: string; autoRestart: boolean } | null;
};

export default function ProcessMonitorPage() {
  const [rows, setRows] = useState<Row[]>([]);

  function load() {
    fetch("/api/admin/processes")
      .then((r) => r.json())
      .then((d) => setRows(d.processes ?? []));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  async function restart(streamId: string, serverId: string) {
    await fetch(`/api/admin/servers/${serverId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restart_stream", streamId }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Process monitor</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Live ffmpeg/nginx processes reported by stream server agents. Stale entries trigger auto-restart when enabled (cron).
        </p>
      </div>
      <DataTable
        headers={["Server", "Stream", "PID", "Status", "CPU %", "RAM MB", "Last seen", ""]}
        rows={rows.map((p) => [
          p.server.name,
          p.stream?.name ?? "—",
          p.pid ?? "—",
          <span key={`s-${p.id}`} style={{ color: p.stale ? "var(--danger)" : "var(--success)" }}>
            {p.status}
            {p.stale ? " (stale)" : ""}
          </span>,
          p.cpuPercent?.toFixed(1) ?? "—",
          p.memoryMb?.toFixed(0) ?? "—",
          formatDateTime(p.lastSeenAt),
          p.stream && p.server ? (
            <button
              key={`r-${p.id}`}
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--accent)" }}
              onClick={() => restart(p.stream!.id, p.server.id)}
            >
              Restart
            </button>
          ) : (
            "—"
          ),
        ])}
      />
      {!rows.length && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No processes yet.{" "}
          <Link href="/admin/servers" style={{ color: "var(--accent)" }}>
            Configure a server agent
          </Link>
          .
        </p>
      )}
    </div>
  );
}
