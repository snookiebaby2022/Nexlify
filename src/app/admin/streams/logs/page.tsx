"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { formatUptime } from "@/lib/stream-live-stats";

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

  function load() {
    fetch("/api/admin/streams/logs")
      .then((r) => r.json())
      .then((d) => {
        setProcesses(d.processes ?? []);
        setActivity(d.activity ?? []);
        setLiveViews(d.liveViews ?? []);
        setRelayErrors(d.relayErrors ?? []);
      });
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Stream logs</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Agent ffmpeg processes, direct/HLS relay viewers, and panel activity (last 24 hours). Direct-source
          channels do not run ffmpeg — use Live viewers and HLS relay errors below.{" "}
          <Link href="/admin/stream_errors" style={{ color: "var(--accent)" }}>
            Stream errors
          </Link>
        </p>
      </div>

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
