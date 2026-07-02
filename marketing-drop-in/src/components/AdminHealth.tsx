"use client";

import { useCallback, useEffect, useState } from "react";

type HealthData = {
  disk: { total: string; used: string; avail: string; pct: string };
  memory: { total: number; used: number; free: number; pct: string };
  uptime: string;
  load: string;
  sslExpiry: string;
  dbSize: string;
  nodeVersion: string;
  pm2Services: { name: string; status: string; pid: number; cpu: string; mem: string; uptime: number; restarts: number }[];
};

function formatUptime(ms: number) {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function AdminHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/health")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !data) return <p className="text-slate-400 text-sm">Loading server health…</p>;
  if (!data) return <p className="text-red-400 text-sm">Failed to load health data.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">System Health</h2>
        <button onClick={load} className="text-xs text-violet-400 hover:text-violet-300">Refresh</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Disk" value={data.disk.pct || "—"} sub={`${data.disk.used} / ${data.disk.total}`} warn={parseInt(data.disk.pct) > 85} />
        <Card label="Memory" value={data.memory.pct || "—"} sub={`${data.memory.used}MB / ${data.memory.total}MB`} warn={parseInt(data.memory.pct) > 85} />
        <Card label="Load" value={data.load || "—"} sub="1 / 5 / 15 min" />
        <Card label="Uptime" value={data.uptime || "—"} sub={`Node ${data.nodeVersion}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card label="SSL Certificate" value={data.sslExpiry || "—"} sub="nexlify.live" warn={data.sslExpiry.includes("days") && parseInt(data.sslExpiry.match(/\d+/)?.[0] || "999") < 30} />
        <Card label="Database" value={data.dbSize || "—"} sub="SQLite file size" />
      </div>

      <section className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-white">PM2 Services</h3>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">PID</th>
                <th className="px-4 py-3">CPU</th>
                <th className="px-4 py-3">Memory</th>
                <th className="px-4 py-3">Uptime</th>
                <th className="px-4 py-3">Restarts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.pm2Services.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-3 text-cyan-300 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className={s.status === "online" ? "text-green-400" : "text-red-400"}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{s.pid}</td>
                  <td className="px-4 py-3">{s.cpu}</td>
                  <td className="px-4 py-3">{s.mem}</td>
                  <td className="px-4 py-3 text-slate-400">{formatUptime(s.uptime)}</td>
                  <td className="px-4 py-3">
                    <span className={s.restarts > 5 ? "text-amber-400" : "text-slate-400"}>{s.restarts}</span>
                  </td>
                </tr>
              ))}
              {!data.pm2Services.length && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No PM2 services found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800 bg-slate-900/50"}`}>
      <p className="text-[var(--muted)] text-xs">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${warn ? "text-amber-400" : "text-white"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
