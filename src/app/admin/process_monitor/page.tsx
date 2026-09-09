"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { RestartStreamModal } from "@/components/restart-stream-modal";

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
  const [restartAllOpen, setRestartAllOpen] = useState(false);
  const [restartAllBusy, setRestartAllBusy] = useState(false);
  const [rowRestart, setRowRestart] = useState<{ streamId: string; serverId: string; name: string } | null>(
    null
  );

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

  async function confirmRestartAll() {
    setRestartAllBusy(true);
    try {
      const unique = [
        ...new Map(
          rows.filter((r) => r.stream && r.server).map((r) => [`${r.stream!.id}-${r.server.id}`, r])
        ).values(),
      ];
      for (const r of unique) {
        await queueStream("restart_stream", r.stream!.id, r.server.id);
      }
      setRestartAllOpen(false);
      load();
    } finally {
      setRestartAllBusy(false);
    }
  }

  async function startAll() {
    if (!confirm("Start all listed streams?")) return;
    const unique = [
      ...new Map(
        rows.filter((r) => r.stream && r.server).map((r) => [`${r.stream!.id}-${r.server.id}`, r])
      ).values(),
    ];
    for (const r of unique) {
      await queueStream("start_stream", r.stream!.id, r.server.id);
    }
    load();
  }

  function statusColor(p: Row): string {
    if (p.status === "stopped" || !p.pid) return "var(--danger)";
    if ((p.cpuPercent ?? 0) > 80) return "#fbbf24";
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
            className="text-base px-5 py-2.5 rounded-xl border font-medium"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          >
            Start All
          </button>
          <button
            type="button"
            onClick={() => setRestartAllOpen(true)}
            className="text-base px-5 py-2.5 rounded-xl border font-medium"
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
                className="text-sm cursor-pointer"
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
                className="text-sm cursor-pointer font-medium"
                style={{ color: "var(--accent)" }}
                onClick={() =>
                  setRowRestart({
                    streamId: p.stream!.id,
                    serverId: p.server.id,
                    name: p.stream!.name,
                  })
                }
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

      {rowRestart ? (
        <RestartStreamModal
          open
          streamId={rowRestart.streamId}
          serverId={rowRestart.serverId}
          streamName={rowRestart.name}
          onClose={() => setRowRestart(null)}
          onDone={load}
        />
      ) : null}

      {restartAllOpen ? (
        <div
          className="fixed inset-0 z-[520] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-all-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
            aria-label="Close"
            disabled={restartAllBusy}
            onClick={() => setRestartAllOpen(false)}
          />
          <div
            className="relative w-full max-w-2xl rounded-2xl border shadow-2xl px-8 py-10 sm:px-10"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--fg)" }}
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
              <RotateCcw size={32} strokeWidth={2.25} />
            </div>
            <h2 id="restart-all-title" className="text-center text-2xl sm:text-3xl font-semibold">
              Restart all streams?
            </h2>
            <p className="mt-4 text-center text-base sm:text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
              Queues a restart for every listed process. Edge fans are dropped so channels rebind to their
              current source URLs. Viewers will reconnect.
            </p>
            <div className="mt-8 flex flex-col-reverse sm:flex-row justify-center gap-3 sm:gap-4">
              <button
                type="button"
                disabled={restartAllBusy}
                onClick={() => setRestartAllOpen(false)}
                className="rounded-xl border px-8 py-3.5 text-base sm:text-lg font-medium disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restartAllBusy}
                onClick={() => void confirmRestartAll()}
                className="rounded-xl px-8 py-3.5 text-base sm:text-lg font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
              >
                {restartAllBusy ? "Restarting…" : "Restart all"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
