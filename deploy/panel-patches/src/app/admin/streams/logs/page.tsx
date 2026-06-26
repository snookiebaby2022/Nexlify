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
};

export default function StreamLogsPage() {
  const [processes, setProcesses] = useState<ProcessLog[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);

  function load() {
    fetch("/api/admin/streams/logs")
      .then((r) => r.json())
      .then((d) => {
        setProcesses(d.processes ?? []);
        setActivity(d.activity ?? []);
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
          Agent process events and panel activity for streams (last 24 hours).{" "}
          <Link href="/admin/stream_errors" style={{ color: "var(--accent)" }}>
            Stream errors
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Process events</h2>
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
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Panel activity</h2>
        <DataTable
          headers={["Action", "Entity", "Time"]}
          rows={activity.map((a) => [
            a.action,
            a.entity && a.entityId ? `${a.entity} ${a.entityId.slice(0, 8)}…` : a.entity ?? "—",
            formatDateTime(a.createdAt),
          ])}
        />
      </section>
    </div>
  );
}
