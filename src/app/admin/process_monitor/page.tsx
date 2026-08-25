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
      .then((d) => setRows(Array.isArray(d.processes) ? d.processes : []));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function queueStream(action: "restart_stream" | "start_stream", streamId: string, serverId: string) {
    const res = await fetch(`/api/admin/servers/${serverId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, streamId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Agent command failed");
    }
  }

  async function restartAll() {
    if (!confirm("Restart all streams?")) return;
    const unique = [...new Map(rows.filter((r) => r.stream && r.server).map((r) => [`${r.stream!.id}-${r.server.id}`, r])).values()];
    for (const r of unique) {
      await queueStream("restart_stream", r.stream!.id, r.server.id);
    }
    load();
  }

  async function startAll() {
    if (!confirm("Start all listed streams?")) return;
    const unique = [...new Map(rows.filter((r) => r.stream && r.server).map((r) => [`${r.stream!.id}-${r.server.id}`, r])).values()];
    for (const r of unique) {
      await queueStream("start_stream", r.stream!.id, r.server.id);
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
            Live ffmpeg/nginx processes reported by stream server agents. Updates every 5 seconds.
            Start/Restart queues the agent (polls about every 30s). Direct/splice channels with no FFmpeg job will report failed on the agent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startAll}
            className="text-sm px-4 py-2 rounded border"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          >
            Start All
          </button>
          <button
            type="button"
            onClick={restartAll}
            className="text-sm px-4 py-2 rounded border"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            Restart All
          </button>
        </div>
      </div>
      <DataTable
        headers={["Server", "Stream", "PID", "Status", "CPU %", "RAM MB", "Last seen", ""]}
        rows={rows.map((p) => [
          p.server?.name ?? "—",
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
            <span key={`r-${p.id}`} className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs cursor-pointer"
                style={{ color: "var(--accent)" }}
                onClick={async () => {
                  await queueStream("start_stream", p.stream!.id, p.server.id);
                  load();
                }}
              >
                Start
              </button>
              <button
                type="button"
                className="text-xs cursor-pointer"
                style={{ color: "var(--accent)" }}
                onClick={async () => {
                  await queueStream("restart_stream", p.stream!.id, p.server.id);
                  load();
                }}
              >
                Restart
              </button>
            </span>
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
