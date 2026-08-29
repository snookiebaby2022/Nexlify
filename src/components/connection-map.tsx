"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { CountryFlag } from "@/components/ip-with-flag";
import { startVisibleInterval } from "@/lib/perf-polling";

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

type Proj = { sx: number; sy: number; z: number; visible: boolean };

function lonLatFromMap(mapX: number, mapY: number): { lon: number; lat: number } {
  return { lon: (mapX / 100) * 360 - 180, lat: 90 - (mapY / 100) * 180 };
}

function project(lat: number, lon: number, rotY: number, w: number, h: number): Proj {
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180 + rotY;
  const x = Math.cos(latR) * Math.sin(lonR);
  const y = Math.sin(latR);
  const z = Math.cos(latR) * Math.cos(lonR);
  const r = Math.min(w, h) * 0.4;
  const cx = w / 2;
  const cy = h / 2 + h * 0.02;
  return { sx: cx + x * r, sy: cy - y * r, z, visible: z > -0.08 };
}

const LANDMASSES: number[][][] = [
  [[80, 85], [95, 72], [130, 65], [160, 60], [180, 62], [200, 72], [210, 85], [215, 100], [220, 115], [210, 130], [195, 145], [175, 155], [155, 165], [140, 175], [125, 180], [110, 175], [95, 165], [80, 150], [70, 130], [65, 110], [70, 95]],
  [[250, 35], [270, 30], [290, 35], [295, 50], [285, 60], [265, 55], [255, 45]],
  [[175, 225], [190, 215], [210, 220], [225, 240], [235, 265], [240, 290], [238, 320], [230, 345], [220, 360], [210, 370], [195, 365], [185, 350], [178, 325], [172, 300], [170, 275], [172, 250]],
  [[460, 65], [475, 58], [490, 55], [510, 60], [520, 70], [525, 85], [520, 100], [510, 110], [495, 115], [480, 118], [465, 112], [455, 100], [450, 85], [455, 72]],
  [[445, 75], [452, 68], [458, 72], [455, 82], [448, 80]],
  [[490, 35], [500, 28], [510, 30], [515, 45], [510, 55], [500, 58], [492, 50], [488, 42]],
  [[460, 155], [480, 148], [500, 145], [520, 150], [535, 165], [545, 185], [550, 210], [548, 240], [540, 270], [525, 300], [510, 320], [495, 330], [480, 325], [465, 310], [455, 285], [450, 255], [448, 225], [450, 195], [455, 170]],
  [[535, 120], [555, 115], [575, 118], [590, 125], [595, 140], [590, 155], [575, 165], [560, 168], [545, 160], [535, 145], [530, 130]],
  [[520, 50], [560, 42], [600, 38], [650, 35], [700, 38], [750, 42], [800, 48], [840, 55], [860, 65], [870, 80], [865, 95], [850, 105], [830, 110], [800, 112], [770, 108], [740, 100], [710, 95], [680, 92], [650, 88], [620, 82], [590, 75], [560, 68], [535, 60]],
  [[620, 155], [640, 148], [660, 152], [675, 165], [680, 185], [675, 205], [665, 220], [650, 228], [635, 222], [625, 205], [618, 185], [615, 170]],
  [[690, 155], [710, 148], [730, 152], [745, 160], [755, 175], [758, 195], [750, 210], [735, 218], [718, 215], [702, 205], [692, 188], [688, 170]],
  [[650, 80], [690, 72], [730, 70], [770, 75], [800, 82], [810, 95], [805, 110], [790, 120], [770, 128], [745, 132], [720, 130], [695, 125], [670, 118], [655, 105], [648, 92]],
  [[830, 100], [838, 92], [845, 95], [848, 108], [842, 118], [835, 115], [830, 108]],
  [[710, 250], [730, 245], [755, 248], [780, 252], [800, 258], [810, 268], [805, 278], [785, 282], [760, 280], [735, 275], [715, 268], [708, 258]],
  [[760, 310], [790, 300], [820, 298], [850, 305], [870, 318], [878, 335], [872, 355], [855, 370], [830, 378], [805, 375], [785, 365], [770, 348], [762, 330]],
  [[890, 365], [898, 358], [905, 362], [908, 375], [902, 385], [895, 380]],
];

export function ConnectionMap({ apiUrl = "/api/admin/connection-map" }: { apiUrl?: string }) {
  const [data, setData] = useState<MapData | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);
  const projRef = useRef<Map<string, Proj>>(new Map());

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(MAP_COLLAPSE_KEY) === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_COLLAPSE_KEY, String(next));
      } catch {
        /* ignore */
      }
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
    return startVisibleInterval(load, 3_000);
  }, [apiUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    timeRef.current += 0.008;
    const rot = timeRef.current * 0.35;

    const space = ctx.createRadialGradient(w * 0.35, h * 0.3, 20, w / 2, h / 2, Math.max(w, h) * 0.7);
    space.addColorStop(0, "#122033");
    space.addColorStop(0.45, "#0a1424");
    space.addColorStop(1, "#050910");
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 48; i++) {
      const sx = ((i * 137.5) % w) + Math.sin(timeRef.current + i) * 2;
      const sy = ((i * 89.3) % h);
      ctx.globalAlpha = 0.15 + ((i * 17) % 40) / 100;
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;

    const r = Math.min(w, h) * 0.4;
    const cx = w / 2;
    const cy = h / 2 + h * 0.02;

    const atm = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.18);
    atm.addColorStop(0, "rgba(56,189,248,0)");
    atm.addColorStop(0.7, "rgba(56,189,248,0.08)");
    atm.addColorStop(1, "rgba(56,189,248,0)");
    ctx.fillStyle = atm;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
    ctx.fill();

    const disc = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    disc.addColorStop(0, "#1d4f73");
    disc.addColorStop(0.55, "#0c2a44");
    disc.addColorStop(1, "#061422");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();

    ctx.strokeStyle = "rgba(125,211,252,0.12)";
    ctx.lineWidth = 0.8;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 6) {
        const p = project(lat, lon, rot, w, h);
        if (!p.visible) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(p.sx, p.sy);
          started = true;
        } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      let started = false;
      for (let lat = -80; lat <= 80; lat += 6) {
        const p = project(lat, lon, rot, w, h);
        if (!p.visible) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(p.sx, p.sy);
          started = true;
        } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(56,189,248,0.22)";
    ctx.strokeStyle = "rgba(125,211,252,0.28)";
    ctx.lineWidth = 1;
    for (const land of LANDMASSES) {
      const pts = land.map(([mx, my]) => {
        const { lon, lat } = lonLatFromMap((mx / 1000) * 100, (my / 500) * 100);
        return project(lat, lon, rot, w, h);
      });
      if (!pts.some((p) => p.visible)) continue;
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        if (!p.visible) continue;
        if (!started) {
          ctx.moveTo(p.sx, p.sy);
          started = true;
        } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const nextProj = new Map<string, Proj>();
    const visiblePts = data.points
      .map((p) => {
        const { lon, lat } = lonLatFromMap(p.mapX, p.mapY);
        const proj = project(lat, lon, rot, w, h);
        nextProj.set(p.id, proj);
        return { p, proj };
      })
      .filter((x) => x.proj.visible);
    projRef.current = nextProj;

    for (let i = 0; i < visiblePts.length; i++) {
      for (let j = i + 1; j < Math.min(visiblePts.length, i + 4); j++) {
        const a = visiblePts[i].proj;
        const b = visiblePts[j].proj;
        const phase = (timeRef.current * 1.6 + i * 0.4) % 1;
        const grad = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
        grad.addColorStop(0, "rgba(56,189,248,0)");
        grad.addColorStop(Math.max(0, phase - 0.25), "rgba(56,189,248,0)");
        grad.addColorStop(phase, "rgba(125,211,252,0.75)");
        grad.addColorStop(Math.min(1, phase + 0.08), "rgba(56,189,248,0)");
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo((a.sx + b.sx) / 2, Math.min(a.sy, b.sy) - 28, b.sx, b.sy);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    for (const { p, proj } of visiblePts) {
      const pulse = Math.sin(timeRef.current * 4 + p.mapX) * 0.5 + 0.5;
      const isHovered = hoveredPoint === p.id;
      const glowSize = isHovered ? 22 : 11 + pulse * 6;
      const glow = ctx.createRadialGradient(proj.sx, proj.sy, 0, proj.sx, proj.sy, glowSize);
      glow.addColorStop(0, isHovered ? "rgba(56,189,248,0.55)" : "rgba(34,197,94,0.4)");
      glow.addColorStop(1, "rgba(34,197,94,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, glowSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, isHovered ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? "#7dd3fc" : "#4ade80";
      ctx.fill();
    }

    ctx.font = "600 11px ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";
    for (const c of data.countries.filter((c) => c.count > 0)) {
      const { lon, lat } = lonLatFromMap(c.mapX, c.mapY);
      const p = project(lat, lon, rot, w, h);
      if (!p.visible) continue;
      const label = `${c.countryCode} ${c.count}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(8,15,28,0.78)";
      ctx.beginPath();
      ctx.roundRect(p.sx + 8, p.sy - 8, tw + 10, 16, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(226,232,240,0.9)";
      ctx.fillText(label, p.sx + 13, p.sy);
    }

    animRef.current = requestAnimationFrame(draw);
  }, [data, hoveredPoint]);

  useEffect(() => {
    if (collapsed || !data) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    animRef.current = requestAnimationFrame(draw);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(animRef.current);
        return;
      }
      animRef.current = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(animRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [draw, collapsed, data]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data?.points.length || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    let found: string | null = null;
    for (const p of data.points) {
      const proj = projRef.current.get(p.id);
      if (!proj?.visible) continue;
      const dist = Math.hypot(mx - proj.sx, my - proj.sy);
      if (dist < 16) {
        found = p.id;
        break;
      }
    }
    setHoveredPoint(found);
  }, [data]);

  const hoveredData = data?.points.find((p) => p.id === hoveredPoint);
  const hoverProj = hoveredPoint ? projRef.current.get(hoveredPoint) : undefined;

  if (!data) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <h3 className="text-sm font-semibold mb-3">Live connection globe</h3>
        <div className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>Loading live viewers…</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={toggleCollapse}
            className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            Live connection globe
          </button>
          {!collapsed && (
            <p className="text-xs mt-0.5 ml-5" style={{ color: "var(--muted)" }}>
              Real-time 3D viewer map · refreshes every 3s
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
              color: data.total > 0 ? "#4ade80" : "var(--muted)",
            }}
          >
            {data.total > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            LIVE · {data.total} watching
          </span>
        </div>
      </div>

      {!collapsed && (
        <>
          <div
            className="relative mx-4 mb-4 rounded-xl overflow-hidden"
            style={{ aspectRatio: expanded ? "16 / 7" : "2.2 / 1", minHeight: expanded ? 380 : 240, transition: "all 0.3s ease" }}
          >
            <canvas
              ref={canvasRef}
              width={1400}
              height={640}
              className="w-full h-full"
              style={{ display: "block", cursor: hoveredPoint ? "pointer" : "default" }}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
            />
            {hoveredData && hoverProj && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${(hoverProj.sx / 1400) * 100}%`,
                  top: `${(hoverProj.sy / 640) * 100}%`,
                  transform: "translate(-50%, -130%)",
                }}
              >
                <div
                  className="px-3 py-2 rounded-lg text-xs whitespace-nowrap"
                  style={{
                    background: "rgba(8,15,28,0.95)",
                    border: "1px solid rgba(56,189,248,0.35)",
                    boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
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
            {data.points.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Globe is live — waiting for viewers</p>
                <p className="text-xs" style={{ color: "rgba(148,163,184,0.45)" }}>
                  Dots appear the moment a line starts watching
                </p>
              </div>
            )}
          </div>

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
