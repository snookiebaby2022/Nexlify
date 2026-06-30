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
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function restartAll() {
    if (!confirm("Restart all streams?")) return;
    const unique = [...new Map(rows.filter((r) => r.stream && r.server).map((r) => [`${r.stream!.id}-${r.server.id}`, r])).values()];
    for (const r of unique) {
      await fetch(`/api/admin/servers/${r.server.id}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart_stream", streamId: r.stream!.id }),
      });
    }
    load();
  }

  function statusColor(p: Row): string {
    if (p.status === "stopped" || !p.pid) return "var(--danger)";
    if ((p.cpuPercent ?? 0) > 80) return "#fbbf24"; // yellow/warning
    return "var(--success)";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Process monitor</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Live ffmpeg/nginx processes reported by stream server agents. Updates every 5 seconds. Stale entries trigger auto-restart when enabled (cron).
          </p>
        </div>
        <button
          type="button"
          onClick={restartAll}
          className="text-sm px-4 py-2 rounded border"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Restart All
        </button>
      </div>
      <DataTable
        headers={["Server", "Stream", "PID", "Status", "CPU %", "RAM MB", "Last seen", ""]}
        rows={rows.map((p) => [
          p.server.name,
          p.stream?.name ?? "—",
          p.pid ?? "—",
          <span key={`s-${p.id}`} style={{ color: statusColor(p) }}>
            {p.status}
            {p.stale ? " (stale)" : ""}
            {(p.cpuPercent ?? 0) > 80 ? " ⚠️ High CPU" : ""}
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
              onClick={async () => {
                await fetch(`/api/admin/servers/${p.server!.id}/agent`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "restart_stream", streamId: p.stream!.id }),
                });
                load();
              }}
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
