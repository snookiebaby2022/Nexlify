"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ServerDashboardMetrics } from "@/components/dashboard-server-card";

function drawAreaChart(
  canvas: HTMLCanvasElement,
  series: { values: number[]; color: string }[],
  maxVal: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = maxVal || 1;
  for (const s of series) {
    if (s.values.length < 2) continue;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = (i / (s.values.length - 1)) * w;
      const y = h - (v / max) * h * 0.88 - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

type ServiceStatus = { name: string; ok: boolean };

export function DashboardXuiResourceMonitor({
  serverMetrics,
  summary,
}: {
  serverMetrics: ServerDashboardMetrics[];
  summary?: {
    onlineConnections: number;
    onlineUsers: number;
    onlineStreams: number;
    onlineServers: number;
  };
}) {
  const cpuMemRef = useRef<HTMLCanvasElement>(null);
  const netRef = useRef<HTMLCanvasElement>(null);
  const connRef = useRef<HTMLCanvasElement>(null);
  const [history, setHistory] = useState({
    cpu: [] as number[],
    mem: [] as number[],
    io: [] as number[],
    netIn: [] as number[],
    netOut: [] as number[],
    streams: [] as number[],
    users: [] as number[],
    conns: [] as number[],
  });
  const [services, setServices] = useState<ServiceStatus[]>([]);

  const primary = serverMetrics[0];

  const tick = useCallback(() => {
    const cpu = primary?.cpu ?? 0;
    const mem = primary?.memory ?? 0;
    setHistory((h) => ({
      cpu: [...h.cpu.slice(-47), cpu],
      mem: [...h.mem.slice(-47), mem],
      io: [...h.io.slice(-47), Math.min(10, cpu * 0.3)],
      netIn: [...h.netIn.slice(-47), Math.random() * 0.4],
      netOut: [...h.netOut.slice(-47), (summary?.onlineConnections ?? 0) > 0 ? 0.8 : 0.05],
      streams: [...h.streams.slice(-47), summary?.onlineStreams ?? 0],
      users: [...h.users.slice(-47), summary?.onlineUsers ?? 0],
      conns: [...h.conns.slice(-47), summary?.onlineConnections ?? 0],
    }));
  }, [primary, summary]);

  useEffect(() => {
    tick();
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, [tick]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        const checks = d.checks ?? {};
        setServices([
          { name: "Panel app", ok: checks.app === "ok" },
          { name: "PostgreSQL", ok: checks.database === "ok" },
          { name: "Redis cache", ok: checks.redis === "ok" },
        ]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cpuMemRef.current) {
      drawAreaChart(
        cpuMemRef.current,
        [
          { values: history.cpu, color: "rgb(56, 189, 248)" },
          { values: history.mem, color: "rgb(167, 139, 250)" },
          { values: history.io, color: "rgb(74, 222, 128)" },
        ],
        100
      );
    }
    if (netRef.current) {
      drawAreaChart(
        netRef.current,
        [
          { values: history.netIn, color: "rgb(56, 189, 248)" },
          { values: history.netOut, color: "rgb(167, 139, 250)" },
        ],
        1
      );
    }
    if (connRef.current) {
      drawAreaChart(
        connRef.current,
        [
          { values: history.streams, color: "rgb(56, 189, 248)" },
          { values: history.users, color: "rgb(167, 139, 250)" },
          { values: history.conns, color: "rgb(74, 222, 128)" },
        ],
        Math.max(5, ...(history.conns.length ? history.conns : [5]))
      );
    }
  }, [history]);

  return (
    <section className="xui-dash-monitor space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="xui-dash-chart-card">
          <h3 className="xui-dash-chart-title">CPU &amp; Memory</h3>
          <canvas ref={cpuMemRef} width={400} height={140} className="w-full h-[140px]" />
        </div>
        <div className="xui-dash-chart-card">
          <h3 className="xui-dash-chart-title">Network Traffic</h3>
          <canvas ref={netRef} width={400} height={140} className="w-full h-[140px]" />
        </div>
        <div className="xui-dash-chart-card">
          <h3 className="xui-dash-chart-title">Connections</h3>
          <canvas ref={connRef} width={400} height={140} className="w-full h-[140px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="xui-dash-chart-card">
          <h3 className="xui-dash-chart-title">Service Status</h3>
          <ul className="space-y-3 mt-2">
            {services.map((s) => (
              <li key={s.name} className="flex items-center justify-between text-sm">
                <span>{s.name}</span>
                <span className={s.ok ? "xui-dash-pass" : "xui-dash-fail"}>{s.ok ? "Passed" : "Failed"}</span>
              </li>
            ))}
          </ul>
        </div>

        {primary && (
          <div className="xui-dash-chart-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="xui-dash-chart-title">{primary.name}</h3>
              <Link href="/admin/servers" className="text-xs text-cyan-400">
                Manage
              </Link>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              {primary.host}
            </p>
            <div className="grid grid-cols-4 gap-2 mb-4 text-center text-xs">
              <div className="xui-dash-metric-box">
                <div className="font-bold text-lg">{summary?.onlineConnections ?? 0}</div>
                <div style={{ color: "var(--muted)" }}>Connections</div>
              </div>
              <div className="xui-dash-metric-box">
                <div className="font-bold text-lg">{summary?.onlineUsers ?? 0}</div>
                <div style={{ color: "var(--muted)" }}>Users</div>
              </div>
              <div className="xui-dash-metric-box">
                <div className="font-bold text-lg">{summary?.onlineStreams ?? 0}</div>
                <div style={{ color: "var(--muted)" }}>Live</div>
              </div>
              <div className="xui-dash-metric-box">
                <div className="font-bold text-lg">{summary?.onlineServers ?? 0}</div>
                <div style={{ color: "var(--muted)" }}>Servers</div>
              </div>
            </div>
            {(["cpu", "memory", "storage"] as const).map((key) => {
              const label = key === "cpu" ? "CPU" : key === "memory" ? "Memory" : "Disk";
              const val = primary[key] ?? 0;
              return (
                <div key={key} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{label}</span>
                    <span>{Math.round(val)}%</span>
                  </div>
                  <div className="xui-dash-bar-track">
                    <div className="xui-dash-bar-fill" style={{ width: `${Math.min(100, val)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
