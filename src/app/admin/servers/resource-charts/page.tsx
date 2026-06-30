"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";

function drawSparkline(canvas: HTMLCanvasElement, values: number[], color: string, maxVal: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx || values.length < 2) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const max = maxVal || Math.max(...values, 1);
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h * 0.9 - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function Sparkline({ values, color, max, label }: { values: number[]; color: string; max: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawSparkline(ref.current, values, color, max);
  }, [values, color, max]);
  const current = values[values.length - 1] ?? 0;
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-lg font-bold mb-2" style={{ color }}>{current.toFixed(1)}%</div>
      <canvas ref={ref} width={300} height={60} className="w-full" />
    </div>
  );
}

export default function ServerResourceChartsPage() {
  const [servers, setServers] = useState<{ id: string; name: string; host: string }[]>([]);
  const [metrics, setMetrics] = useState<Record<string, { cpu: number[]; ram: number[]; disk: number[] }>>({});
  const maxPoints = 60;

  const loadServers = useCallback(() => {
    fetch("/api/admin/servers").then((r) => r.json()).then((d) => setServers(d.servers ?? []));
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  useEffect(() => {
    const interval = setInterval(() => {
      servers.forEach((s) => {
        fetch(`/api/admin/servers/${s.id}/metrics`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => {
            if (!d) return;
            setMetrics((prev) => {
              const m = prev[s.id] || { cpu: [], ram: [], disk: [] };
              return {
                ...prev,
                [s.id]: {
                  cpu: [...m.cpu.slice(-maxPoints + 1), d.cpuPercent ?? 0],
                  ram: [...m.ram.slice(-maxPoints + 1), d.ramPercent ?? 0],
                  disk: [...m.disk.slice(-maxPoints + 1), d.diskPercent ?? 0],
                },
              };
            });
          })
          .catch(() => {});
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [servers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Server Resource Charts</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Real-time CPU, RAM, and disk usage across all servers. Updates every 5 seconds.</p>
      </div>
      {servers.map((s) => {
        const m = metrics[s.id] || { cpu: [], ram: [], disk: [] };
        return (
          <div key={s.id} className="space-y-4">
            <h2 className="text-lg font-semibold">{s.name} <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>({s.host})</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Sparkline values={m.cpu} color="#38bdf8" max={100} label="CPU Usage" />
              <Sparkline values={m.ram} color="#a78bfa" max={100} label="RAM Usage" />
              <Sparkline values={m.disk} color="#fbbf24" max={100} label="Disk Usage" />
            </div>
          </div>
        );
      })}
      {!servers.length && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No servers configured. Add a server to see resource charts.</p>
      )}
    </div>
  );
}
