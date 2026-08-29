"use client";

import { useRef } from "react";
import Link from "next/link";
import type { ServerDashboardMetrics } from "@/components/dashboard-server-card";
import { streamServerDisplayName } from "@/lib/stream-server-display";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 36 - (v / max) * 32;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" className="w-full h-10" preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} />
    </svg>
  );
}

function gaugeColor(pct: number) {
  if (pct > 80) return "#f87171";
  if (pct > 50) return "#fbbf24";
  return "#34d399";
}

function Gauge({ label, pct }: { label: string; pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  const color = gaugeColor(p);
  return (
    <div className="text-center">
      <div
        className="dash-gauge"
        style={{ background: `conic-gradient(${color} ${p}%, rgba(148,163,184,0.18) 0)` }}
      >
        <div className="dash-gauge-inner">{Math.round(p)}%</div>
      </div>
      <p className="text-[10px] uppercase mt-1 tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </p>
    </div>
  );
}

export function DashboardXuiServerTiles({ servers }: { servers: ServerDashboardMetrics[] }) {
  const cpuHist = useRef<Record<string, number[]>>({});
  const lastAt = useRef(0);
  if (Date.now() - lastAt.current >= 4000) {
    lastAt.current = Date.now();
    for (const s of servers) {
      const prev = cpuHist.current[s.id] ?? [];
      cpuHist.current[s.id] = [...prev.slice(-11), Math.min(100, Math.max(0, s.cpu))];
    }
  }

  if (!servers.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide" style={{ color: "var(--muted)" }}>
          Servers
        </h2>
        <Link href="/admin/servers" className="text-xs underline" style={{ color: "var(--accent)" }}>
          Manage
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {servers.map((s) => {
          const history = cpuHist.current[s.id]?.length ? cpuHist.current[s.id] : [s.cpu, s.cpu];
          const headerColor = s.online ? "#059669" : "#dc2626";
          const slots = s.maxClients && s.maxClients > 0 ? s.maxClients : 0;
          const conxPct = slots > 0 ? Math.min(100, ((s.connections ?? 0) / slots) * 100) : 0;
          return (
            <div key={s.id} className="dash-server-card">
              <div
                className="px-3 py-2 flex items-center justify-between text-white text-sm font-semibold"
                style={{ background: headerColor }}
              >
                <Link href="/admin/servers" className="truncate hover:underline">
                  {streamServerDisplayName(s.name, s.host)}
                </Link>
                <span className="text-[10px] font-normal opacity-90 tabular-nums">
                  {s.connections ?? 0} conns
                </span>
              </div>
              <div className="p-3 space-y-3">
                <Sparkline values={history} color={s.online ? "#34d399" : "#f87171"} />
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
                    <p style={{ color: "var(--muted)" }}>Live</p>
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
                    <p className="font-bold tabular-nums">{s.vodStreams ?? 0}</p>
                    <p style={{ color: "var(--muted)" }}>VOD</p>
                  </div>
                </div>
                <div className="flex justify-around pt-1">
                  <Gauge label="CPU" pct={s.cpu} />
                  <Gauge label="RAM" pct={s.memory} />
                  <Gauge label="CONNS" pct={conxPct} />
                </div>
                <div className="space-y-1.5 pt-1">
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "var(--muted)" }}>
                      <span>Bandwidth</span>
                      <span>{s.download}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.18)" }}>
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${s.download}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "var(--muted)" }}>
                      <span>Disk</span>
                      <span>{s.storage}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.18)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.storage}%`,
                          background: s.storage > 90 ? "#f87171" : "#34d399",
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
