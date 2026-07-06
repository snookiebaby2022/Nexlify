"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { CountryFlag } from "@/components/ip-with-flag";

const MAP_COLLAPSE_KEY = "nx-dash-collapse-connmap";

type MapData = {
  total: number;
  countries: {
    countryCode: string;
    countryName: string | null;
    count: number;
    mapX: number;
    mapY: number;
  }[];
  points: {
    id: string;
    mapX: number;
    mapY: number;
    line: string;
    stream: string | null;
    countryCode: string | null;
  }[];
};

export function ConnectionMap({ apiUrl = "/api/admin/connection-map" }: { apiUrl?: string }) {
  const [data, setData] = useState<MapData | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(MAP_COLLAPSE_KEY) === "true");
    } catch {}
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(MAP_COLLAPSE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    function load() {
      fetch(apiUrl)
        .then((r) => r.json())
        .then(setData)
        .catch(() => setData(null));
    }
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [apiUrl]);

  // Canvas-based map rendering
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    timeRef.current += 0.015;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0c1929");
    bg.addColorStop(0.5, "#0a1628");
    bg.addColorStop(1, "#070e1a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = "rgba(56,189,248,0.04)";
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += h / 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 0; x < w; x += w / 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // World map landmasses (Natural Earth inspired, filled)
    ctx.fillStyle = "rgba(56,189,248,0.06)";
    ctx.strokeStyle = "rgba(56,189,248,0.18)";
    ctx.lineWidth = 1;

    const landmasses = [
      // North America
      [[80,85],[95,72],[130,65],[160,60],[180,62],[200,72],[210,85],[215,100],[220,115],[210,130],[195,145],[175,155],[155,165],[140,175],[125,180],[110,175],[95,165],[80,150],[70,130],[65,110],[70,95]],
      // Greenland
      [[250,35],[270,30],[290,35],[295,50],[285,60],[265,55],[255,45]],
      // South America
      [[175,225],[190,215],[210,220],[225,240],[235,265],[240,290],[238,320],[230,345],[220,360],[210,370],[195,365],[185,350],[178,325],[172,300],[170,275],[172,250]],
      // Europe
      [[460,65],[475,58],[490,55],[510,60],[520,70],[525,85],[520,100],[510,110],[495,115],[480,118],[465,112],[455,100],[450,85],[455,72]],
      // UK
      [[445,75],[452,68],[458,72],[455,82],[448,80]],
      // Scandinavia
      [[490,35],[500,28],[510,30],[515,45],[510,55],[500,58],[492,50],[488,42]],
      // Africa
      [[460,155],[480,148],[500,145],[520,150],[535,165],[545,185],[550,210],[548,240],[540,270],[525,300],[510,320],[495,330],[480,325],[465,310],[455,285],[450,255],[448,225],[450,195],[455,170]],
      // Middle East
      [[535,120],[555,115],[575,118],[590,125],[595,140],[590,155],[575,165],[560,168],[545,160],[535,145],[530,130]],
      // Russia/Asia
      [[520,50],[560,42],[600,38],[650,35],[700,38],[750,42],[800,48],[840,55],[860,65],[870,80],[865,95],[850,105],[830,110],[800,112],[770,108],[740,100],[710,95],[680,92],[650,88],[620,82],[590,75],[560,68],[535,60]],
      // India
      [[620,155],[640,148],[660,152],[675,165],[680,185],[675,205],[665,220],[650,228],[635,222],[625,205],[618,185],[615,170]],
      // Southeast Asia
      [[690,155],[710,148],[730,152],[745,160],[755,175],[758,195],[750,210],[735,218],[718,215],[702,205],[692,188],[688,170]],
      // China/Mongolia
      [[650,80],[690,72],[730,70],[770,75],[800,82],[810,95],[805,110],[790,120],[770,128],[745,132],[720,130],[695,125],[670,118],[655,105],[648,92]],
      // Japan
      [[830,100],[838,92],[845,95],[848,108],[842,118],[835,115],[830,108]],
      // Indonesia
      [[710,250],[730,245],[755,248],[780,252],[800,258],[810,268],[805,278],[785,282],[760,280],[735,275],[715,268],[708,258]],
      // Australia
      [[760,310],[790,300],[820,298],[850,305],[870,318],[878,335],[872,355],[855,370],[830,378],[805,375],[785,365],[770,348],[762,330]],
      // New Zealand
      [[890,365],[898,358],[905,362],[908,375],[902,385],[895,380]],
    ];

    for (const land of landmasses) {
      ctx.beginPath();
      ctx.moveTo(land[0][0] * w / 1000, land[0][1] * h / 500);
      for (let i = 1; i < land.length; i++) {
        ctx.lineTo(land[i][0] * w / 1000, land[i][1] * h / 500);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Animated connection arcs between points (if multiple)
    if (data.points.length > 1) {
      const centerX = data.points.reduce((s, p) => s + p.mapX, 0) / data.points.length;
      const centerY = data.points.reduce((s, p) => s + p.mapY, 0) / data.points.length;

      for (let i = 0; i < data.points.length; i++) {
        for (let j = i + 1; j < data.points.length; j++) {
          const p1 = data.points[i];
          const p2 = data.points[j];
          const x1 = (p1.mapX / 100) * w;
          const y1 = (p1.mapY / 100) * h;
          const x2 = (p2.mapX / 100) * w;
          const y2 = (p2.mapY / 100) * h;

          // Animated arc
          const phase = (timeRef.current * 2 + i * 0.5) % 1;
          const grad = ctx.createLinearGradient(x1, y1, x2, y2);
          grad.addColorStop(0, "rgba(56,189,248,0)");
          grad.addColorStop(Math.max(0, phase - 0.3), "rgba(56,189,248,0)");
          grad.addColorStop(phase, "rgba(56,189,248,0.5)");
          grad.addColorStop(Math.min(1, phase + 0.1), "rgba(56,189,248,0)");

          const midX = (x1 + x2) / 2;
          const midY = Math.min(y1, y2) - 30 - Math.abs(x2 - x1) * 0.1;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(midX, midY, x2, y2);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Connection points with glow
    for (const p of data.points) {
      const px = (p.mapX / 100) * w;
      const py = (p.mapY / 100) * h;
      const isHovered = hoveredPoint === p.id;
      const pulse = Math.sin(timeRef.current * 3 + p.mapX) * 0.5 + 0.5;

      // Outer glow
      const glowSize = isHovered ? 20 : 12 + pulse * 4;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, glowSize);
      glow.addColorStop(0, isHovered ? "rgba(56,189,248,0.4)" : "rgba(34,197,94,0.3)");
      glow.addColorStop(1, "rgba(34,197,94,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(px, py, isHovered ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? "#38bdf8" : "#22c55e";
      ctx.fill();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(px - 1, py - 1, isHovered ? 2 : 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fill();

      // Hover ring
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(56,189,248,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Country labels for non-zero countries
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (const c of data.countries.filter((c) => c.count > 0)) {
      const cx = (c.mapX / 100) * w;
      const cy = (c.mapY / 100) * h;

      // Label background
      const label = `${c.countryCode} ${c.count}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(15,23,42,0.8)";
      ctx.beginPath();
      ctx.roundRect(cx + 6, cy - 8, tw + 8, 16, 4);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(label, cx + 10, cy);
    }

    animRef.current = requestAnimationFrame(draw);
  }, [data, hoveredPoint]);

  useEffect(() => {
    if (!collapsed && data) {
      animRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [draw, collapsed, data]);

  // Mouse hit test for canvas
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data?.points.length || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let found: string | null = null;
    for (const p of data.points) {
      const px = (p.mapX / 100) * canvasRef.current.width;
      const py = (p.mapY / 100) * canvasRef.current.height;
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist < 15) {
        found = p.id;
        break;
      }
    }
    setHoveredPoint(found);
  }, [data]);

  const hoveredData = data?.points.find((p) => p.id === hoveredPoint);

  if (!data) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <h3 className="text-sm font-semibold mb-3">Connection map</h3>
        <div className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>Loading connection map…</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={toggleCollapse}
            className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            Connection map
          </button>
          {!collapsed && (
            <p className="text-xs mt-0.5 ml-5" style={{ color: "var(--muted)" }}>
              Live viewer locations · auto-refreshes every 15s
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-1.5 rounded hover:bg-white/5 cursor-pointer"
            style={{ color: "var(--muted)" }}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{
              background: data.total > 0 ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.1)",
              color: data.total > 0 ? "#22c55e" : "var(--muted)",
            }}
          >
            {data.total > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            {data.total} active
          </span>
        </div>
      </div>

      {!collapsed && (
        <>
          <div
            className="relative mx-4 mb-4 rounded-xl overflow-hidden"
            style={{ aspectRatio: expanded ? "16 / 7" : "2 / 1", minHeight: expanded ? 350 : 200, transition: "all 0.3s ease" }}
          >
            <canvas
              ref={canvasRef}
              width={1200}
              height={600}
              className="w-full h-full"
              style={{ display: "block", cursor: hoveredPoint ? "pointer" : "default" }}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
            />

            {/* Tooltip */}
            {hoveredData && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${hoveredData.mapX}%`,
                  top: `${hoveredData.mapY}%`,
                  transform: "translate(-50%, -130%)",
                }}
              >
                <div
                  className="px-3 py-2 rounded-lg text-xs whitespace-nowrap"
                  style={{
                    background: "rgba(15,23,42,0.95)",
                    border: "1px solid rgba(56,189,248,0.3)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 15px rgba(56,189,248,0.1)",
                  }}
                >
                  <div className="font-medium text-white">{hoveredData.line}</div>
                  {hoveredData.stream && <div className="text-sky-300">{hoveredData.stream}</div>}
                  {hoveredData.countryCode && (
                    <div className="text-neutral-400 mt-0.5">
                      <CountryFlag code={hoveredData.countryCode} /> {hoveredData.countryCode}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {data.points.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="text-4xl opacity-20">🌍</div>
                <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>No active connections</p>
                <p className="text-xs" style={{ color: "rgba(148,163,184,0.4)" }}>
                  Viewer dots appear when lines are watching live TV
                </p>
              </div>
            )}
          </div>

          {/* Country summary */}
          {data.countries.length > 0 && (
            <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {data.countries.slice(0, 12).map((c) => (
                <div
                  key={c.countryCode}
                  className="rounded-lg border px-3 py-2 text-xs flex items-center justify-between"
                  style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="text-base leading-none"><CountryFlag code={c.countryCode} /></span>
                    <span className="truncate">{c.countryName ?? c.countryCode}</span>
                  </span>
                  <span className="font-semibold tabular-nums shrink-0">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
