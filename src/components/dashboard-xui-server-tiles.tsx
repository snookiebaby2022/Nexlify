"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { ServerDashboardMetrics } from "@/components/dashboard-server-card";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || values.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...values, 1);
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [values, color]);
  return <canvas ref={canvasRef} width={280} height={48} className="w-full h-12" />;
}

function Gauge({ label, pct }: { label: string; pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="text-center">
      <div
        className="w-12 h-12 mx-auto rounded-full border-4 flex items-center justify-center text-[10px] font-bold tabular-nums"
        style={{
          borderColor: p > 80 ? "#dd4b39" : p > 50 ? "#f39c12" : "#00a65a",
          color: "var(--muted)",
        }}
      >
        {Math.round(p)}%
      </div>
      <p className="text-[10px] uppercase mt-1" style={{ color: "var(--muted)" }}>
        {label}
      </p>
    </div>
  );
}

export function DashboardXuiServerTiles({ servers }: { servers: ServerDashboardMetrics[] }) {
  if (!servers.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
        Streaming servers
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {servers.map((s) => {
          const history = Array.from({ length: 12 }, (_, i) =>
            Math.max(0, (s.connections ?? 0) + Math.sin(i + s.id.length) * 3 + i * 0.5)
          );
          const headerColor = s.online ? "#00a65a" : "#dd4b39";
          return (
            <div
              key={s.id}
              className="rounded-lg border overflow-hidden bg-white dark:bg-slate-800/40 shadow-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="px-3 py-2 flex items-center justify-between text-white text-sm font-semibold"
                style={{ background: headerColor }}
              >
                <Link href="/admin/servers" className="truncate hover:underline">
                  {s.name}
                </Link>
                <span className="text-[10px] font-normal opacity-90 tabular-nums">{s.connections ?? 0} req/s</span>
              </div>
              <div className="p-3 space-y-3">
                <Sparkline values={history} color={headerColor} />
                <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                  <div>
                    <p className="font-bold tabular-nums">{s.connections ?? 0}</p>
                    <p style={{ color: "var(--muted)" }}>Conns</p>
                  </div>
                  <div>
                    <p className="font-bold tabular-nums">{s.users ?? 0}</p>
                    <p style={{ color: "var(--muted)" }}>Users</p>
                  </div>
                  <div>
                    <p className="font-bold tabular-nums">{s.streamsOn ?? 0}</p>
                    <p style={{ color: "var(--muted)" }}>StreamOn</p>
                  </div>
                  <div>
                    <p className="font-bold tabular-nums">{s.download}%</p>
                    <p style={{ color: "var(--muted)" }}>Output</p>
                  </div>
                  <div>
                    <p className="font-bold tabular-nums">{s.upload}%</p>
                    <p style={{ color: "var(--muted)" }}>Input</p>
                  </div>
                  <div>
                    <p className="font-bold tabular-nums">{s.streamsOff ?? 0}</p>
                    <p style={{ color: "var(--muted)" }}>StreamOff</p>
                  </div>
                </div>
                <div className="flex justify-around pt-1">
                  <Gauge label="CPU" pct={s.cpu} />
                  <Gauge label="RAM" pct={s.memory} />
                  <Gauge label="CONX" pct={Math.min(100, (s.connections ?? 0) * 8)} />
                </div>
                <div className="space-y-1.5 pt-1">
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "var(--muted)" }}>
                      <span>Bandwidth</span>
                      <span>{s.download}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${s.download}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "var(--muted)" }}>
                      <span>Disk</span>
                      <span>{s.storage}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.storage}%`,
                          background: s.storage > 90 ? "#dd4b39" : "#00a65a",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
