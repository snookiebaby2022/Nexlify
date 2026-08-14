"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sparkline } from "@/components/server-resource-sparkline";

export default function ServerResourceChartsPage() {
  const [servers, setServers] = useState<{ id: string; name: string; host: string }[]>([]);
  const [metrics, setMetrics] = useState<Record<string, { cpu: number[]; ram: number[]; disk: number[] }>>({});
  const [error, setError] = useState("");
  const maxPoints = 60;

  const loadServers = useCallback(() => {
    fetch("/api/admin/servers")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
        setServers(d.servers ?? []);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load servers"));
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const pullMetrics = useCallback(() => {
    servers.forEach((s) => {
      fetch(`/api/admin/servers/${s.id}/metrics`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setMetrics((prev) => {
            const m = prev[s.id] || { cpu: [], ram: [], disk: [] };
            return {
              ...prev,
              [s.id]: {
                cpu: [...m.cpu.slice(-maxPoints + 1), Number(d.cpu ?? d.cpuPercent ?? 0)],
                ram: [...m.ram.slice(-maxPoints + 1), Number(d.ram ?? d.ramPercent ?? 0)],
                disk: [...m.disk.slice(-maxPoints + 1), Number(d.disk ?? d.diskPercent ?? 0)],
              },
            };
          });
        })
        .catch(() => {});
    });
  }, [servers]);

  useEffect(() => {
    if (!servers.length) return;
    pullMetrics();
    const interval = setInterval(pullMetrics, 5000);
    return () => clearInterval(interval);
  }, [servers, pullMetrics]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Server Resource Charts</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Real-time CPU, RAM, and disk usage. Updates every 5 seconds.
        </p>
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}{" "}
          <button type="button" className="underline" onClick={loadServers}>
            Retry
          </button>
        </p>
      ) : null}
      {servers.map((s) => {
        const m = metrics[s.id] || { cpu: [], ram: [], disk: [] };
        return (
          <div key={s.id} className="space-y-4">
            <h2 className="text-lg font-semibold">
              <Link href={`/admin/servers/${s.id}`} className="hover:underline">
                {s.name}
              </Link>{" "}
              <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
                ({s.host})
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Sparkline values={m.cpu} color="#38bdf8" max={100} label="CPU Usage" />
              <Sparkline values={m.ram} color="#a78bfa" max={100} label="RAM Usage" />
              <Sparkline values={m.disk} color="#fbbf24" max={100} label="Disk Usage" />
            </div>
          </div>
        );
      })}
      {!servers.length && !error && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No servers configured.{" "}
          <Link href="/admin/servers/add" className="underline" style={{ color: "var(--accent)" }}>
            Add a server
          </Link>{" "}
          to see resource charts.
        </p>
      )}
    </div>
  );
}
