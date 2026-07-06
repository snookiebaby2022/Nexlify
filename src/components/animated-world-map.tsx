"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CountryFlag } from "@/components/ip-with-flag";

type MapData = {
  total: number;
  countries: { countryCode: string; countryName: string | null; count: number; mapX: number; mapY: number }[];
  points: { id: string; mapX: number; mapY: number; line: string; stream: string | null; countryCode: string | null }[];
};

// Convert lat/lng to Mercator x/y (0-100 range)
function latLngToMercator(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * 100;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 100;
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
}

// World map coastline points (simplified Natural Earth)
const WORLD_PATHS: string[] = [
  // North America
  "M5,25 L8,22 L12,20 L18,18 L22,17 L25,18 L28,20 L30,22 L32,25 L30,28 L28,32 L25,35 L22,38 L18,40 L15,42 L12,40 L10,38 L8,35 L6,30 Z",
  // South America
  "M22,50 L25,48 L28,50 L30,55 L32,60 L33,65 L32,70 L30,75 L28,78 L25,80 L23,78 L22,75 L21,70 L20,65 L21,60 L22,55 Z",
  // Europe
  "M48,20 L50,18 L52,17 L55,18 L57,20 L58,22 L57,25 L55,28 L53,30 L50,32 L48,30 L47,28 L48,25 Z",
  // Africa
  "M48,35 L50,33 L53,32 L56,33 L58,35 L60,40 L62,45 L63,50 L62,55 L60,60 L58,65 L55,68 L52,70 L50,68 L48,65 L47,60 L46,55 L45,50 L46,45 L47,40 Z",
  // Asia
  "M58,15 L62,13 L66,12 L70,13 L74,15 L78,18 L82,22 L85,25 L88,28 L90,32 L92,35 L90,38 L88,40 L85,42 L82,40 L78,38 L74,35 L70,32 L66,28 L62,25 L60,22 L58,18 Z",
  // Southeast Asia / Indonesia
  "M72,45 L75,43 L78,42 L80,43 L82,45 L85,48 L88,50 L90,52 L88,55 L85,53 L82,50 L78,48 L75,47 Z",
  // Australia
  "M78,60 L82,58 L86,58 L90,60 L92,63 L93,66 L92,70 L90,73 L86,75 L82,73 L80,70 L78,66 Z",
];

export function AnimatedWorldMap({ apiUrl = "/api/admin/connection-map" }: { apiUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const animFrame = useRef(0);
  const pulsePhase = useRef(0);

  // Load data
  useEffect(() => {
    function load() {
      fetch(apiUrl)
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    }
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [apiUrl]);

  // Draw map
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0a1628");
    grad.addColorStop(1, "#060e1a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx + pan.x, cy + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);

    // Grid lines
    ctx.strokeStyle = "rgba(96,165,250,0.06)";
    ctx.lineWidth = 0.5 / zoom;
    for (let y = 0; y <= 100; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, (y / 100) * h);
      ctx.lineTo(w, (y / 100) * h);
      ctx.stroke();
    }
    for (let x = 0; x <= 100; x += 10) {
      ctx.beginPath();
      ctx.moveTo((x / 100) * w, 0);
      ctx.lineTo((x / 100) * w, h);
      ctx.stroke();
    }

    // Draw world map outlines
    ctx.strokeStyle = "rgba(96,165,250,0.15)";
    ctx.fillStyle = "rgba(96,165,250,0.03)";
    ctx.lineWidth = 1 / zoom;
    for (const pathStr of WORLD_PATHS) {
      const path = new Path2D(pathStr);
      const m = new DOMMatrix();
      m.a = w / 100;
      m.d = h / 100;
      const scaled = new Path2D();
      scaled.addPath(path, m);
      ctx.fill(scaled);
      ctx.stroke(scaled);
    }

    // Animated pulse phase
    pulsePhase.current = (pulsePhase.current + 0.02) % (Math.PI * 2);

    // Draw connection points
    if (data?.points) {
      for (const p of data.points) {
        const px = (p.mapX / 100) * w;
        const py = (p.mapY / 100) * h;
        const isHovered = hoveredPoint === p.id;

        // Pulse ring
        const pulseSize = 8 + Math.sin(pulsePhase.current) * 4;
        ctx.beginPath();
        ctx.arc(px, py, pulseSize / zoom, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? "rgba(34,197,94,0.4)" : "rgba(34,197,94,0.15)";
        ctx.fill();

        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, 5 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(34,197,94,0.3)";
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, 3 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? "#4ade80" : "#22c55e";
        ctx.fill();

        // Hover highlight
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(px, py, 12 / zoom, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(34,197,94,0.5)";
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        }
      }
    }

    // Draw country labels for high-count countries
    if (data?.countries) {
      ctx.font = `${10 / zoom}px sans-serif`;
      for (const c of data.countries.filter((c) => c.count > 0)) {
        const cx2 = (c.mapX / 100) * w;
        const cy2 = (c.mapY / 100) * h;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(`${c.countryCode} ${c.count}`, cx2 + 6 / zoom, cy2 + 3 / zoom);
      }
    }

    ctx.restore();

    animFrame.current = requestAnimationFrame(draw);
  }, [data, zoom, pan, hoveredPoint]);

  useEffect(() => {
    animFrame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrame.current);
  }, [draw]);

  // Mouse handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.5, Math.min(8, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: panStart.current.x + (e.clientX - dragStart.current.x),
        y: panStart.current.y + (e.clientY - dragStart.current.y),
      });
    }

    // Hit test for points
    if (data?.points && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;
      const cx = w / 2 + pan.x;
      const cy = h / 2 + pan.y;

      let found: string | null = null;
      for (const p of data.points) {
        const px = (p.mapX / 100) * w * zoom + cx - (cx * zoom);
        const py = (p.mapY / 100) * h * zoom + cy - (cy * zoom);
        const dist = Math.sqrt((mx - px / (w / rect.width)) ** 2 + (my - py / (h / rect.height)) ** 2);
        if (dist < 15) {
          found = p.id;
          setTooltipPos({ x: e.clientX, y: e.clientY });
          break;
        }
      }
      setHoveredPoint(found);
    }
  }, [isDragging, data, zoom, pan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const hoveredData = data?.points.find((p) => p.id === hoveredPoint);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Connection Map</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Scroll to zoom · Drag to pan · Double-click to reset
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded" style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>
            {zoom.toFixed(1)}x
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{
              background: (data?.total ?? 0) > 0 ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.1)",
              color: (data?.total ?? 0) > 0 ? "#22c55e" : "var(--muted)",
            }}
          >
            {(data?.total ?? 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            {data?.total ?? 0} active
          </span>
        </div>
      </div>

      <div ref={containerRef} className="relative mx-4 mb-4 rounded-xl overflow-hidden" style={{ cursor: isDragging ? "grabbing" : "grab" }}>
        <canvas
          ref={canvasRef}
          width={1200}
          height={600}
          className="w-full h-auto"
          style={{ display: "block" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        />

        {/* Tooltip */}
        {hoveredData && tooltipPos && (
          <div
            className="fixed px-3 py-2 rounded-lg text-xs whitespace-nowrap z-50 pointer-events-none"
            style={{
              left: tooltipPos.x + 12,
              top: tooltipPos.y - 40,
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(148,163,184,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            <div className="font-medium text-white">{hoveredData.line}</div>
            {hoveredData.stream && <div className="text-neutral-400">{hoveredData.stream}</div>}
            {hoveredData.countryCode && (
              <div className="text-neutral-500 mt-0.5">
                <CountryFlag code={hoveredData.countryCode} /> {hoveredData.countryCode}
              </div>
            )}
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, z + 0.5))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer"
            style={{ background: "rgba(15,23,42,0.85)", border: "1px solid rgba(148,163,184,0.2)", color: "#fff" }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer"
            style={{ background: "rgba(15,23,42,0.85)", border: "1px solid rgba(148,163,184,0.2)", color: "#fff" }}
          >
            −
          </button>
          <button
            type="button"
            onClick={handleDoubleClick}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs cursor-pointer"
            style={{ background: "rgba(15,23,42,0.85)", border: "1px solid rgba(148,163,184,0.2)", color: "#fff" }}
            title="Reset view"
          >
            ⟲
          </button>
        </div>

        {/* Empty state */}
        {data && data.points.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="text-3xl opacity-30">📡</div>
            <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>No active connections</p>
          </div>
        )}
      </div>

      {/* Country summary */}
      {data && data.countries.length > 0 && (
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
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
    </div>
  );
}
