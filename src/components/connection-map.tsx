"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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

function countryCodeToFlag(cc: string): string {
  if (!cc || cc.length !== 2) return "";
  const base = 127397;
  return String.fromCodePoint(cc.toUpperCase().charCodeAt(0) + base, cc.toUpperCase().charCodeAt(1) + base);
}

export function ConnectionMap({ apiUrl = "/api/admin/connection-map" }: { apiUrl?: string }) {
  const [data, setData] = useState<MapData | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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

  if (!data) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <h3 className="text-sm font-semibold mb-3">Connection map</h3>
        <div className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
          Loading connection map…
        </div>
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
              Live viewer locations · refreshes every 15s
            </p>
          )}
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{
            background: data.total > 0 ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.1)",
            color: data.total > 0 ? "#22c55e" : "var(--muted)",
          }}
        >
          {data.total > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
          {data.total} active
        </span>
      </div>

      {!collapsed && (
        <>
          <div
            className="relative mx-4 mb-4 rounded-xl overflow-hidden"
            style={{
              background: "linear-gradient(180deg, #0a1628 0%, #060e1a 100%)",
              aspectRatio: "2 / 1",
              minHeight: 200,
            }}
          >
        {/* World map SVG outline */}
        <svg
          viewBox="0 0 1000 500"
          className="absolute inset-0 w-full h-full"
          style={{ opacity: 0.12 }}
        >
          {/* Simplified world map outlines */}
          <g fill="none" stroke="#60a5fa" strokeWidth="0.8">
            {/* North America */}
            <path d="M150,120 L200,100 L260,95 L280,110 L300,100 L310,120 L290,140 L300,160 L280,180 L250,200 L220,210 L190,195 L160,170 L140,150 Z" />
            <path d="M250,200 L270,220 L260,250 L240,260 L220,250 L230,230 Z" />
            {/* South America */}
            <path d="M260,280 L290,270 L310,290 L320,320 L310,360 L290,390 L270,400 L255,380 L250,340 L240,310 Z" />
            {/* Europe */}
            <path d="M460,100 L490,90 L520,95 L530,110 L520,130 L500,140 L480,135 L465,120 Z" />
            <path d="M440,130 L460,120 L470,135 L460,150 L440,145 Z" />
            {/* Africa */}
            <path d="M460,170 L500,160 L530,180 L540,220 L530,270 L510,310 L480,330 L460,310 L450,270 L445,220 L450,190 Z" />
            {/* Asia */}
            <path d="M540,80 L600,70 L660,75 L720,90 L760,100 L780,120 L770,150 L740,170 L700,180 L660,175 L620,160 L580,150 L550,130 L540,110 Z" />
            <path d="M700,180 L740,190 L760,210 L740,230 L710,240 L690,230 L680,210 Z" />
            {/* Australia */}
            <path d="M750,320 L800,310 L830,320 L840,345 L820,370 L790,380 L760,370 L745,350 Z" />
          </g>
          {/* Grid lines */}
          {[100, 200, 300, 400].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="#60a5fa" strokeWidth="0.3" strokeDasharray="4 8" />
          ))}
          {[200, 400, 600, 800].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="500" stroke="#60a5fa" strokeWidth="0.3" strokeDasharray="4 8" />
          ))}
        </svg>

        {/* Connection points */}
        {data.points.map((p) => (
          <div
            key={p.id}
            className="absolute group"
            style={{
              left: `${p.mapX}%`,
              top: `${p.mapY}%`,
              transform: "translate(-50%, -50%)",
            }}
            onMouseEnter={() => setHoveredPoint(p.id)}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Pulse ring */}
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{
                width: 16,
                height: 16,
                margin: "auto",
                background: "rgba(34,197,94,0.3)",
              }}
            />
            {/* Dot */}
            <span
              className="relative block rounded-full"
              style={{
                width: 8,
                height: 8,
                background: "#22c55e",
                boxShadow: "0 0 6px rgba(34,197,94,0.6), 0 0 12px rgba(34,197,94,0.3)",
              }}
            />
            {/* Tooltip */}
            {hoveredPoint === p.id && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap z-10 pointer-events-none"
                style={{
                  background: "rgba(15,23,42,0.95)",
                  border: "1px solid rgba(148,163,184,0.2)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                <div className="font-medium text-white">{p.line}</div>
                {p.stream && <div className="text-neutral-400">{p.stream}</div>}
                {p.countryCode && (
                  <div className="text-neutral-500 mt-0.5">
                    {countryCodeToFlag(p.countryCode)} {p.countryCode}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {!data.points.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="text-3xl opacity-30">📡</div>
            <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              No active connections
            </p>
            <p className="text-xs" style={{ color: "rgba(148,163,184,0.5)" }}>
              Viewer dots appear when lines are watching live TV
            </p>
          </div>
        )}

        {/* Legend */}
        <div
          className="absolute bottom-3 left-3 px-3 py-2 rounded-lg text-xs space-y-1.5"
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(148,163,184,0.15)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-neutral-400">Active viewer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 opacity-40" />
            <span className="text-neutral-400">Regional density</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">⚡</span>
            <span className="text-neutral-400">Connection arc</span>
          </div>
        </div>
      </div>

      {/* Country summary */}
      {data.countries.length > 0 && (
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.countries.slice(0, 12).map((c) => (
            <div
              key={c.countryCode}
              className="rounded-lg border px-3 py-2 text-xs flex items-center justify-between"
              style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
            >
              <span className="flex items-center gap-1.5 truncate">
                <span className="text-base leading-none">{countryCodeToFlag(c.countryCode)}</span>
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
