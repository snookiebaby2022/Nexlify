"use client";

import { useEffect, useState } from "react";
import { formatUptime, type StreamLiveStat } from "@/lib/stream-live-stats";

export function StreamLiveInfo({ streamId }: { streamId: string | null }) {
  const [stats, setStats] = useState<StreamLiveStat | null>(null);

  useEffect(() => {
    if (!streamId) {
      setStats(null);
      return;
    }
    function load() {
      fetch(`/api/admin/streams?withStats=1&streamId=${streamId}`)
        .then((r) => r.json())
        .then((d) => setStats(d.liveStats ?? null));
    }
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [streamId]);

  if (!streamId || !stats) return null;

  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm grid sm:grid-cols-4 gap-3"
      style={{ borderColor: "var(--border)", background: "rgba(94,184,232,0.06)" }}
    >
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Status
        </div>
        <div className="font-medium capitalize">{stats.status}</div>
      </div>
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Uptime
        </div>
        <div className="font-medium">{formatUptime(stats.uptimeSeconds)}</div>
      </div>
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Viewers
        </div>
        <div className="font-medium">{stats.viewers}</div>
      </div>
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Servers
        </div>
        <div className="font-medium text-xs">
          {stats.servers.length
            ? stats.servers.map((s) => s.serverName).join(", ")
            : "—"}
        </div>
      </div>
    </div>
  );
}
