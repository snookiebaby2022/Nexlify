"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { formatUptime } from "@/lib/stream-live-stats";
import { LogsPageToolbar } from "@/components/logs-page-toolbar";
import { DEFAULT_LOG_PAGE_SIZE } from "@/lib/log-page";

type ProcessLog = {
  id: string;
  status: string;
  errorMessage: string | null;
  startedAt: string | null;
  lastSeenAt: string;
  stream: { id: string; name: string } | null;
  server: { id: string; name: string };
};

type ActivityLog = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
  streamName?: string | null;
};

type LiveView = {
  id: string;
  ip: string | null;
  lastSeenAt: string;
  stream: { id: string; name: string } | null;
  line: { username: string };
};

export default function StreamLogsPage() {
  const [processes, setProcesses] = useState<ProcessLog[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [liveViews, setLiveViews] = useState<LiveView[]>([]);
  const [relayErrors, setRelayErrors] = useState<ActivityLog[]>([]);
  const [playbackEvents, setPlaybackEvents] = useState<ActivityLog[]>([]);
  const [pageSize, setPageSize] = useState(DEFAULT_LOG_PAGE_SIZE);
  const [clearBusy, setClearBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/streams/logs?limit=${pageSize}`)
      .then((r) => r.json())
      .then((d) => {
        setProcesses(d.processes ?? []);
        setActivity(d.activity ?? []);
        setLiveViews(d.liveViews ?? []);
        setRelayErrors(d.relayErrors ?? []);
        setPlaybackEvents(d.playbackEvents ?? []);
      });
  }, [pageSize]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Stream logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Freezes, stutters, channel drops, agent ffmpeg, and HLS relay errors (last 24 hours). Direct-source
          channels do not run ffmpeg — use Live viewers below.{" "}
          <Link href="/admin/stream_errors" style={{ color: "var(--accent)" }}>
            Stream errors
          </Link>
        </p>
      </div>

      <LogsPageToolbar
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRefresh={load}
        clearBusy={clearBusy}
        clearLabel="Clear stream activity"
        onClear={async () => {
          if (!confirm("Delete stream-related panel activity and HLS relay error logs? Live viewers are not disconnected.")) return;
          setClearBusy(true);
          try {
            await fetch("/api/admin/streams/logs", { method: "DELETE" });
            load();
          } finally {
            setClearBusy(false);
          }
        }}
      />

      <section>
        <h2 className="text-lg font-medium mb-3">Playback quality</h2>
        {playbackEvents.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No freezes, stutters, or channel drops logged in the last 24 hours.
          </p>
        ) : (
          <DataTable
            headers={["When", "Event", "Stream", "Detail"]}
            rows={playbackEvents.map((a) => [
              formatDateTime(a.createdAt),
              a.action.replace("playback_", "").replace(/_/g, " "),
              a.streamName ?? (a.entityId ? `${a.entityId.slice(0, 8)}…` : "—"),
              String(
                (a.meta as { detail?: string; error?: string })?.detail ??
                  (a.meta as { error?: string })?.error ??
                  "—"
              ),
            ])}
          />
        )}
      </section>

      {relayErrors.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">HLS relay errors</h2>
          <DataTable
            headers={["Stream", "Status", "Detail", "Time"]}
            rows={relayErrors.map((a) => [
              a.streamName ?? (a.entityId ? `${a.entityId.slice(0, 8)}…` : "—"),
              String((a.meta as { status?: number })?.status ?? "—"),
              String(
                (a.meta as { detail?: string; error?: string })?.detail ??
                  (a.meta as { error?: string })?.error ??
                  "upstream failed"
              ),
              formatDateTime(a.createdAt),
            ])}
          />
        </section>
      )}

      {relayErrors.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No HLS relay errors in the last 24 hours.
        </p>
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">Live viewers (direct relay)</h2>
        {liveViews.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No active direct-relay viewers in the last 24 hours.
          </p>
        ) : (
        <DataTable
          headers={["Stream", "Line", "IP", "Last seen"]}
          rows={liveViews.map((v) => [
            v.stream?.name ?? "—",
            v.line.username,
            v.ip ?? "—",
            formatDateTime(v.lastSeenAt),
          ])}
        />
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Process events (ffmpeg)</h2>
        {processes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No ffmpeg agent processes in the last 24 hours. Direct-source channels relay without ffmpeg — check Live viewers above.
          </p>
        ) : (
        <DataTable
          headers={["Stream", "Server", "Status", "Uptime", "Error", "Last seen"]}
          rows={processes.map((p) => {
            const uptime =
              p.startedAt && p.status === "running"
                ? formatUptime(
                    Math.max(0, Math.floor((Date.now() - new Date(p.startedAt).getTime()) / 1000))
                  )
                : "—";
            return [
              p.stream ? (
                <Link
                  key={`s-${p.id}`}
                  href={`/admin/servers/streams?edit=${p.stream.id}`}
                  style={{ color: "var(--accent)" }}
                >
                  {p.stream.name}
                </Link>
              ) : (
                "—"
              ),
              p.server.name,
              p.status,
              uptime,
              p.errorMessage ?? "—",
              formatDateTime(p.lastSeenAt),
            ];
          })}
        />
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Panel activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No stream-related panel activity in the last 24 hours.
          </p>
        ) : (
        <DataTable
          headers={["Action", "Entity", "Time"]}
          rows={activity.map((a) => [
            a.action,
            a.entity && a.entityId ? `${a.entity} ${a.entityId.slice(0, 8)}…` : a.entity ?? "—",
            formatDateTime(a.createdAt),
          ])}
        />
        )}
      </section>
    </div>
  );
}
