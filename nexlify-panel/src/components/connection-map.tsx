"use client";

import { useEffect, useState } from "react";

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
      <div className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
        Loading connection map…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Connection map</h3>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {data.total} active · refreshes every 15s
        </span>
      </div>

      <div
        className="relative rounded-xl border overflow-hidden"
        style={{
          borderColor: "var(--border)",
          background: "linear-gradient(180deg, #0c1929 0%, #071018 100%)",
          aspectRatio: "2 / 1",
          minHeight: 180,
        }}
      >
        <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full opacity-20">
          {[10, 20, 30, 40].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#94a3b8" strokeWidth="0.1" />
          ))}
          {[20, 40, 60, 80].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="50" stroke="#94a3b8" strokeWidth="0.1" />
          ))}
        </svg>
        {data.points.map((p) => (
          <span
            key={p.id}
            title={`${p.line}${p.stream ? ` · ${p.stream}` : ""}${p.countryCode ? ` · ${p.countryCode}` : ""}`}
            className="absolute h-2.5 w-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 animate-pulse"
            style={{
              left: `${p.mapX}%`,
              top: `${p.mapY}%`,
              background: "#22c55e",
              boxShadow: "0 0 8px rgba(34,197,94,0.8)",
            }}
          />
        ))}
        {!data.points.length && (
          <div
            className="absolute inset-0 flex items-center justify-center text-sm"
            style={{ color: "var(--muted)" }}
          >
            No active connections
          </div>
        )}
      </div>

      {data.countries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.countries.slice(0, 12).map((c) => (
            <div
              key={c.countryCode}
              className="rounded-lg border px-3 py-2 text-xs flex justify-between"
              style={{ borderColor: "var(--border)" }}
            >
              <span>
                {c.countryName ?? c.countryCode}{" "}
                <span style={{ color: "var(--muted)" }}>({c.countryCode})</span>
              </span>
              <span className="font-semibold">{c.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
