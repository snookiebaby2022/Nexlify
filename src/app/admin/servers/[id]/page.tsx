"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Sparkline } from "@/components/server-resource-sparkline";
import { ServerAgentPanel } from "@/components/server-agent-panel";
import { ServerEdgeAuthPanel } from "@/components/server-edge-auth-panel";
import { ServerFfmpegPanel } from "@/components/server-ffmpeg-panel";

export default function AdminServerViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [server, setServer] = useState<{
    id: string;
    name: string;
    host: string;
    healthStatus?: string;
    isActive?: boolean;
    domain?: string | null;
  } | null>(null);
  const [metrics, setMetrics] = useState({ cpu: [] as number[], ram: [] as number[], disk: [] as number[] });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/servers/${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Failed to load server");
        setServer(d.server);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load server"));
  }, [id]);

  useEffect(() => {
    const tick = () => {
      fetch(`/api/admin/servers/${id}/metrics`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setMetrics((m) => ({
            cpu: [...m.cpu.slice(-59), d.cpu ?? 0],
            ram: [...m.ram.slice(-59), d.ram ?? 0],
            disk: [...m.disk.slice(-59), d.disk ?? 0],
          }));
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
        <Link href="/admin/servers" className="underline text-sm" style={{ color: "var(--accent)" }}>
          Back to Manage Servers
        </Link>
      </div>
    );
  }

  if (!server) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading server…</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{server.name}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {server.host}
            {server.domain ? ` · ${server.domain}` : ""} · {server.healthStatus ?? "unknown"}
            {server.isActive === false ? " · inactive" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/servers/${id}/edit`}
            className="text-sm px-3 py-1.5 rounded border"
            style={{ borderColor: "var(--border)" }}
          >
            Edit server
          </Link>
          <Link href="/admin/servers" className="text-sm px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            Manage Servers
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Sparkline values={metrics.cpu} color="#38bdf8" max={100} label="CPU Usage" />
        <Sparkline values={metrics.ram} color="#a78bfa" max={100} label="RAM Usage" />
        <Sparkline values={metrics.disk} color="#fbbf24" max={100} label="Disk Usage" />
      </div>
      <ServerEdgeAuthPanel serverId={id} serverName={server.name} />
      <ServerFfmpegPanel serverId={id} />
      <ServerAgentPanel serverId={id} />
    </div>
  );
}
