"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { startVisibleInterval } from "@/lib/perf-polling";

type QoeSnapshot = {
  liveConnections: number;
  stallSessions: number;
  avgFirstPictureMs: number | null;
  servers: number;
  saturatedServers: number;
  worstHeadroomPct: number;
  worstServerName: string | null;
  capMbps: number;
  usedMbps: number;
  lbNames?: string[];
};

export function DashboardCapacityStrip() {
  const [data, setData] = useState<QoeSnapshot | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/admin/playback-qoe", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setData(d && typeof d.usedMbps === "number" ? d : null))
        .catch(() => setData(null));
    }
    load();
    return startVisibleInterval(load, 45_000);
  }, []);

  if (!data) return null;

  const usedPct = data.capMbps > 0 ? Math.min(100, Math.round((data.usedMbps / data.capMbps) * 100)) : 0;
  const warn = data.saturatedServers > 0 || data.worstHeadroomPct < 15;
  const bar = warn ? "#f97316" : "#22c55e";

  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ borderColor: warn ? "rgba(249,115,22,0.45)" : "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="font-medium">
            {data.servers === 0
              ? "Egress headroom — no load balancers detected"
              : warn
                ? "LB egress almost full — new viewers should not land here"
                : "LB egress headroom"}
          </p>
          <span className="tabular-nums text-xs" style={{ color: "var(--muted)" }}>
            {data.usedMbps.toFixed(1)} / {data.capMbps} Mbps
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.2)" }}>
          <div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: bar }} />
        </div>
        <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
          {data.servers
            ? `${data.servers} LB${data.servers === 1 ? "" : "s"} auto-detected${data.lbNames?.length ? ` (${data.lbNames.join(", ")})` : ""}`
            : "Main server is excluded — add or tag a load balancer"}
          {" · "}
          {data.liveConnections} live
          {data.worstServerName ? ` · lowest headroom ${data.worstServerName} ${data.worstHeadroomPct}%` : ""}
        </p>
      </div>
      <Link href="/admin/servers/load-balancer" className="text-xs font-medium shrink-0 underline" style={{ color: "var(--accent)" }}>
        Load balancer
      </Link>
    </div>
  );
}
