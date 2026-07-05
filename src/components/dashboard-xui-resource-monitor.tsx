"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ServerDashboardMetrics } from "@/components/dashboard-server-card";

const MAX_POINTS = 60;

type ServiceStatus = { name: string; ok: boolean };

function MiniGraph({
  values,
  color,
  maxVal = 100,
}: {
  values: number[];
  color: string;
  maxVal?: number;
}) {
  const max = maxVal || 1;
  return (
    <div className="flex items-end gap-px h-[60px]">
      {values.map((v, i) => {
        const pct = Math.min(100, (v / max) * 100);
        return (
          <div
            key={i}
            className="flex-1 rounded-t-sm transition-all duration-300"
            style={{
              height: `${Math.max(2, pct)}%`,
              background: color,
              opacity: 0.3 + (i / values.length) * 0.7,
            }}
          />
        );
      })}
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
        {/* CPU & Memory */}
        <div className="xui-dash-chart-card">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => toggle("cpu-mem")}
              className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
            >
              {collapsed["cpu-mem"] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              CPU &amp; Memory
            </button>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgb(56, 189, 248)" }} />
                <span style={{ color: "var(--muted)" }}>CPU</span>
                <span className="font-semibold">{Math.round(lastCpu)}%</span>
              </span>
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgb(167, 139, 250)" }} />
                <span style={{ color: "var(--muted)" }}>Mem</span>
                <span className="font-semibold">{Math.round(lastMem)}%</span>
              </span>
            </div>
          </div>
          {!collapsed["cpu-mem"] && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] mb-1" style={{ color: "var(--muted)" }}>CPU</p>
                <MiniGraph values={history.cpu} color="rgb(56, 189, 248)" />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: "var(--muted)" }}>Memory</p>
                <MiniGraph values={history.mem} color="rgb(167, 139, 250)" />
              </div>
            </div>
          )}
        </div>

        {/* Network Traffic */}
        <div className="xui-dash-chart-card">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => toggle("net")}
              className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
            >
              {collapsed["net"] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              Network Traffic
            </button>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgb(74, 222, 128)" }} />
                <span style={{ color: "var(--muted)" }}>Up</span>
                <span className="font-semibold">{Math.round(lastUp)}%</span>
              </span>
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgb(251, 146, 60)" }} />
                <span style={{ color: "var(--muted)" }}>Down</span>
                <span className="font-semibold">{Math.round(lastDown)}%</span>
              </span>
            </div>
          </div>
          {!collapsed["net"] && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] mb-1" style={{ color: "var(--muted)" }}>Upload</p>
                <MiniGraph values={history.upload} color="rgb(74, 222, 128)" />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: "var(--muted)" }}>Download</p>
                <MiniGraph values={history.download} color="rgb(251, 146, 60)" />
              </div>
            </div>
          )}
        </div>

        {/* Connections */}
        <div className="xui-dash-chart-card">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => toggle("conns")}
              className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
            >
              {collapsed["conns"] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              Connections
            </button>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgb(56, 189, 248)" }} />
                <span style={{ color: "var(--muted)" }}>Conns</span>
                <span className="font-semibold">{lastConns}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgb(167, 139, 250)" }} />
                <span style={{ color: "var(--muted)" }}>Users</span>
                <span className="font-semibold">{lastUsers}</span>
              </span>
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgb(74, 222, 128)" }} />
                <span style={{ color: "var(--muted)" }}>Streams</span>
                <span className="font-semibold">{lastStreams}</span>
              </span>
            </div>
          </div>
          {!collapsed["conns"] && (
            <MiniGraph
              values={history.conns}
              color="rgb(56, 189, 248)"
              maxVal={Math.max(5, ...history.conns)}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Service Status */}
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

        {/* Server Details */}
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
