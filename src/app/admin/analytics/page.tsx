"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";

function drawHeatmap(canvas: HTMLCanvasElement, data: { country: string; viewers: number }[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !data.length) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(...data.map((d) => d.viewers), 1);
  data.forEach((d, i) => {
    const x = ((i % 10) / 10) * w;
    const y = (Math.floor(i / 10) / 5) * h;
    const intensity = d.viewers / max;
    ctx.fillStyle = `rgba(0, 192, 239, ${intensity * 0.8 + 0.1})`;
    ctx.fillRect(x + 1, y + 1, w / 10 - 2, h / 5 - 2);
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    ctx.fillText(d.country, x + 4, y + 14);
    ctx.fillText(String(d.viewers), x + 4, y + 26);
  });
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("24h");
  const [bandwidth, setBandwidth] = useState<{ time: string; mbps: number }[]>([]);
  const [geo, setGeo] = useState<{ country: string; viewers: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/analytics?range=${timeRange}`)
      .then((r) => r.json())
      .then((d) => {
        setBandwidth(d.bandwidth ?? []);
        setGeo(d.geo ?? []);
      })
      .catch(() => {});
  }, [timeRange]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (canvasRef.current && geo.length) drawHeatmap(canvasRef.current, geo);
  }, [geo]);

  const totalBandwidth = useMemo(() => bandwidth.reduce((a, b) => a + b.mbps, 0), [bandwidth]);
  const avgBandwidth = useMemo(() => (bandwidth.length ? totalBandwidth / bandwidth.length : 0), [bandwidth, totalBandwidth]);
  const peakBandwidth = useMemo(() => (bandwidth.length ? Math.max(...bandwidth.map((b) => b.mbps)) : 0), [bandwidth]);
  const totalViewers = useMemo(() => geo.reduce((a, b) => a + b.viewers, 0), [geo]);

  async function generatePDF() {
    const res = await fetch("/api/admin/analytics/pdf", { method: "POST" });
    if (!res.ok) return alert("Failed to generate PDF");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexlify-analytics-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Advanced Analytics</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Bandwidth, viewer geography, and performance metrics.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="1h">Last 1 hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <button
            type="button"
            className="rounded px-4 py-2 text-sm"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={generatePDF}
          >
            Generate PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>Avg Bandwidth</div>
          <div className="text-2xl font-bold mt-1" style={{ color: "var(--accent)" }}>{avgBandwidth.toFixed(1)} Mbps</div>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>Peak Bandwidth</div>
          <div className="text-2xl font-bold mt-1" style={{ color: "var(--accent)" }}>{peakBandwidth.toFixed(1)} Mbps</div>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>Total Viewers</div>
          <div className="text-2xl font-bold mt-1" style={{ color: "var(--accent)" }}>{totalViewers.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>Countries</div>
          <div className="text-2xl font-bold mt-1" style={{ color: "var(--accent)" }}>{geo.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Bandwidth Over Time</h3>
          <div className="space-y-2">
            {bandwidth.slice(-20).map((b) => (
              <div key={b.time} className="flex items-center gap-2">
                <span className="text-xs w-16" style={{ color: "var(--muted)" }}>{new Date(b.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min((b.mbps / (peakBandwidth || 1)) * 100, 100)}%`, background: "var(--accent)" }} />
                </div>
                <span className="text-xs w-12 text-right">{b.mbps.toFixed(0)}</span>
              </div>
            ))}
            {!bandwidth.length && <p className="text-sm text-center" style={{ color: "var(--muted)" }}>No data yet.</p>}
          </div>
        </div>

        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Viewer Geography Heatmap</h3>
          <canvas ref={canvasRef} width={400} height={200} className="w-full rounded" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {geo.slice(0, 10).map((g) => (
              <div key={g.country} className="flex justify-between text-xs">
                <span>{g.country}</span>
                <span style={{ color: "var(--accent)" }}>{g.viewers}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
