"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ServerDashboardMetrics } from "@/components/dashboard-server-card";

const MAX_POINTS = 60;

type ServiceStatus = { name: string; ok: boolean };

function drawChart(
  canvas: HTMLCanvasElement,
  series: { values: number[]; color: string; label: string }[],
  maxVal: number,
  opts?: { fill?: boolean; gridLines?: number; suffix?: string }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width * dpr;
  const h = rect.height * dpr;
  canvas.width = w;
  canvas.height = h;
  ctx.scale(dpr, dpr);
  const cw = rect.width;
  const ch = rect.height;
  ctx.clearRect(0, 0, cw, ch);

  const padTop = 8;
  const padBottom = 20;
  const padLeft = 0;
  const padRight = 0;
  const chartH = ch - padTop - padBottom;
  const chartW = cw - padLeft - padRight;
  const max = maxVal || 1;

  // Grid lines
  const gridCount = opts?.gridLines ?? 4;
  ctx.strokeStyle = "rgba(148,163,184,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridCount; i++) {
    const y = padTop + (chartH / gridCount) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(cw - padRight, y);
    ctx.stroke();
  }

  // Draw each series
  for (const s of series) {
    if (s.values.length < 2) continue;
    const pts = s.values.map((v, i) => ({
      x: padLeft + (i / (s.values.length - 1)) * chartW,
      y: padTop + chartH - (Math.min(v, max) / max) * chartH,
    }));

    // Filled area
    if (opts?.fill !== false) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padTop + chartH);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts[pts.length - 1].x, padTop + chartH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      grad.addColorStop(0, s.color.replace(")", ",0.25)").replace("rgb", "rgba"));
      grad.addColorStop(1, s.color.replace(")", ",0.02)").replace("rgb", "rgba"));
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Line
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Current value dot
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Bottom labels
  ctx.fillStyle = "rgba(148,163,184,0.5)";
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  const labels = ["60s", "45s", "30s", "15s", "Now"];
  for (let i = 0; i < labels.length; i++) {
    const x = padLeft + (i / (labels.length - 1)) * chartW;
    ctx.fillText(labels[i], x, ch - 4);
  }
}

function ChartCard({
  title,
  canvasRef,
  legends,
  collapsed,
  onToggle,
}: {
  title: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  legends: { label: string; color: string; value: string }[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="xui-dash-chart-card">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          {title}
        </button>
        <div className="flex items-center gap-3">
          {legends.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] tabular-nums">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} />
              <span style={{ color: "var(--muted)" }}>{l.label}</span>
              <span className="font-semibold">{l.value}</span>
            </span>
          ))}
        </div>
      </div>
      {!collapsed && (
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 140 }}
        />
      )}
    </div>
  );
}

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
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("nx-dash-collapse") || "{}");
    } catch {
      return {};
    }
  });

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("nx-dash-collapse", JSON.stringify(next));
      return next;
    });
  }, []);

  const [history, setHistory] = useState({
    cpu: [] as number[],
    mem: [] as number[],
    upload: [] as number[],
    download: [] as number[],
    streams: [] as number[],
    users: [] as number[],
    conns: [] as number[],
  });

  const primary = serverMetrics[0];

  const tick = useCallback(() => {
    const cpu = primary?.cpu ?? 0;
    const mem = primary?.memory ?? 0;
    const up = primary?.upload ?? 0;
    const down = primary?.download ?? 0;
    setHistory((h) => ({
      cpu: [...h.cpu.slice(-(MAX_POINTS - 1)), cpu],
      mem: [...h.mem.slice(-(MAX_POINTS - 1)), mem],
      upload: [...h.upload.slice(-(MAX_POINTS - 1)), up],
      download: [...h.download.slice(-(MAX_POINTS - 1)), down],
      streams: [...h.streams.slice(-(MAX_POINTS - 1)), summary?.onlineStreams ?? 0],
      users: [...h.users.slice(-(MAX_POINTS - 1)), summary?.onlineUsers ?? 0],
      conns: [...h.conns.slice(-(MAX_POINTS - 1)), summary?.onlineConnections ?? 0],
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
          { name: "Redis cache", ok: checks.redis === "ok" || checks.redis === "skipped" },
        ]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cpuMemRef.current && !collapsed["cpu-mem"]) {
      drawChart(
        cpuMemRef.current,
        [
          { values: history.cpu, color: "rgb(56, 189, 248)", label: "CPU" },
          { values: history.mem, color: "rgb(167, 139, 250)", label: "Memory" },
        ],
        100,
        { fill: true, gridLines: 4, suffix: "%" }
      );
    }
    if (netRef.current && !collapsed["net"]) {
      drawChart(
        netRef.current,
        [
          { values: history.upload, color: "rgb(74, 222, 128)", label: "Upload" },
          { values: history.download, color: "rgb(251, 146, 60)", label: "Download" },
        ],
        100,
        { fill: true, gridLines: 4, suffix: "%" }
      );
    }
    if (connRef.current && !collapsed["conns"]) {
      const maxConn = Math.max(5, ...history.conns);
      drawChart(
        connRef.current,
        [
          { values: history.conns, color: "rgb(56, 189, 248)", label: "Connections" },
          { values: history.users, color: "rgb(167, 139, 250)", label: "Users" },
          { values: history.streams, color: "rgb(74, 222, 128)", label: "Streams" },
        ],
        maxConn * 1.2,
        { fill: true, gridLines: 4 }
      );
    }
  }, [history, collapsed]);

  const lastCpu = history.cpu[history.cpu.length - 1] ?? 0;
  const lastMem = history.mem[history.mem.length - 1] ?? 0;
  const lastUp = history.upload[history.upload.length - 1] ?? 0;
  const lastDown = history.download[history.download.length - 1] ?? 0;
  const lastConns = history.conns[history.conns.length - 1] ?? 0;
  const lastUsers = history.users[history.users.length - 1] ?? 0;
  const lastStreams = history.streams[history.streams.length - 1] ?? 0;

  return (
    <section className="xui-dash-monitor space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="CPU & Memory"
          canvasRef={cpuMemRef}
          collapsed={!!collapsed["cpu-mem"]}
          onToggle={() => toggle("cpu-mem")}
          legends={[
            { label: "CPU", color: "rgb(56, 189, 248)", value: `${Math.round(lastCpu)}%` },
            { label: "Memory", color: "rgb(167, 139, 250)", value: `${Math.round(lastMem)}%` },
          ]}
        />
        <ChartCard
          title="Network Traffic"
          canvasRef={netRef}
          collapsed={!!collapsed["net"]}
          onToggle={() => toggle("net")}
          legends={[
            { label: "Upload", color: "rgb(74, 222, 128)", value: `${Math.round(lastUp)}%` },
            { label: "Download", color: "rgb(251, 146, 60)", value: `${Math.round(lastDown)}%` },
          ]}
        />
        <ChartCard
          title="Connections"
          canvasRef={connRef}
          collapsed={!!collapsed["conns"]}
          onToggle={() => toggle("conns")}
          legends={[
            { label: "Conns", color: "rgb(56, 189, 248)", value: String(lastConns) },
            { label: "Users", color: "rgb(167, 139, 250)", value: String(lastUsers) },
            { label: "Streams", color: "rgb(74, 222, 128)", value: String(lastStreams) },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="xui-dash-chart-card">
          <button
            type="button"
            onClick={() => toggle("services")}
            className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer w-full text-left mb-2"
          >
            {collapsed["services"] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            Service Status
          </button>
          {!collapsed["services"] && (
            <ul className="space-y-3 mt-2">
              {services.map((s) => (
                <li key={s.name} className="flex items-center justify-between text-sm">
                  <span>{s.name}</span>
                  <span className={s.ok ? "xui-dash-pass" : "xui-dash-fail"}>{s.ok ? "Passed" : "Failed"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {primary && (
          <div className="xui-dash-chart-card">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => toggle("server")}
                className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
              >
                {collapsed["server"] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {primary.name}
              </button>
              <Link href="/admin/servers" className="text-xs text-cyan-400">
                Manage
              </Link>
            </div>
            {!collapsed["server"] && (
              <>
                <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                  {primary.host}
                </p>
                <div className="grid grid-cols-4 gap-2 mb-4 text-center text-xs">
                  <div className="xui-dash-metric-box">
                    <div className="font-bold text-lg">{summary?.onlineConnections ?? 0}</div>
                    <div style={{ color: "var(--muted)" }}>Connections</div>
                  </div>
                  <div className="xui-dash-metric-box">
                    <div className="font-bold text-lg">{summary?.onlineServers ?? 0}</div>
                    <div style={{ color: "var(--muted)" }}>Servers</div>
                  </div>
                  <div className="xui-dash-metric-box">
                    <div className="font-bold text-lg">{summary?.onlineUsers ?? 0}</div>
                    <div style={{ color: "var(--muted)" }}>Users</div>
                  </div>
                  <div className="xui-dash-metric-box">
                    <div className="font-bold text-lg">{summary?.onlineStreams ?? 0}</div>
                    <div style={{ color: "var(--muted)" }}>Live</div>
                  </div>
                </div>
                {(["cpu", "memory", "storage"] as const).map((key) => {
                  const label = key === "cpu" ? "CPU" : key === "memory" ? "Memory" : "Disk";
                  const val = primary[key] ?? 0;
                  const barColor =
                    val > 90
                      ? "linear-gradient(90deg, #ef4444, #dc2626)"
                      : val > 70
                        ? "linear-gradient(90deg, #f59e0b, #d97706)"
                        : "linear-gradient(90deg, #38bdf8, #0ea5e9)";
                  return (
                    <div key={key} className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{label}</span>
                        <span className="tabular-nums">{Math.round(val)}%</span>
                      </div>
                      <div className="xui-dash-bar-track">
                        <div
                          className="xui-dash-bar-fill"
                          style={{ width: `${Math.min(100, val)}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
