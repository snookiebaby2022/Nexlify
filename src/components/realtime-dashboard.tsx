"use client";

import { useDashboardStream, type DashboardStreamData } from "@/hooks/use-dashboard-stream";
import { ArrowDown, ArrowUp, Play, Users, Wifi, Zap } from "lucide-react";
import Link from "next/link";

function KpiCard({
  label,
  value,
  icon,
  gradient,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: string;
  href?: string;
}) {
  const inner = (
    <div
      className="rounded-lg p-4 text-white h-full min-h-[88px] flex flex-col justify-between shadow-md"
      style={{ background: gradient }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-90">{label}</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{value}</p>
        </div>
        <div className="opacity-80 shrink-0">{icon}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-95 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function RealtimeDashboard() {
  const { data, connected } = useDashboardStream();

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: connected ? "#22c55e" : "#ef4444" }}
        />
        <span style={{ color: "var(--muted)" }}>
          {connected ? "Real-time connected" : "Connecting…"}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Open Connections"
          value={data?.onlineConnections ?? 0}
          icon={<Wifi size={28} />}
          gradient="linear-gradient(135deg, #00a65a 0%, #008d4c 100%)"
          href="/admin/connections"
        />
        <KpiCard
          label="Online Users"
          value={data?.onlineUsers ?? 0}
          icon={<Users size={28} />}
          gradient="linear-gradient(135deg, #3c8dbc 0%, #2e6da4 100%)"
          href="/admin/lines"
        />
        <KpiCard
          label="Bandwidth"
          value={`${(data?.networkOutMbps ?? 0).toFixed(1)} Mbps`}
          icon={<Zap size={28} />}
          gradient="linear-gradient(135deg, #f39c12 0%, #e08e0b 100%)"
          href="/admin/servers"
        />
        <KpiCard
          label="Online Streams"
          value={data?.onlineStreams ?? 0}
          icon={<Play size={28} />}
          gradient="linear-gradient(135deg, #00a65a 0%, #008d4c 100%)"
          href="/admin/streams"
        />
      </div>

      {/* Bandwidth detail */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-lg border p-3 flex items-center gap-3"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <ArrowUp size={16} className="text-green-400" />
          <div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Output</p>
            <p className="text-lg font-bold">{(data?.networkOutMbps ?? 0).toFixed(1)} Mbps</p>
          </div>
        </div>
        <div
          className="rounded-lg border p-3 flex items-center gap-3"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <ArrowDown size={16} className="text-blue-400" />
          <div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Input</p>
            <p className="text-lg font-bold">{(data?.networkInMbps ?? 0).toFixed(1)} Mbps</p>
          </div>
        </div>
      </div>

      {/* Live connections table */}
      {data?.connections && data.connections.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h3 className="text-sm font-semibold">Live Connections</h3>
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--card)" }}>
                  <th className="text-left px-4 py-2">Line</th>
                  <th className="text-left px-4 py-2">Stream</th>
                  <th className="text-left px-4 py-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.connections.map((c) => {
                  const started = new Date(c.startedAt);
                  const durationSec = Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000));
                  const h = Math.floor(durationSec / 3600);
                  const m = Math.floor((durationSec % 3600) / 60);
                  const s = durationSec % 60;
                  const duration = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

                  return (
                    <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-2 font-medium">{c.line}</td>
                      <td className="px-4 py-2" style={{ color: "var(--muted)" }}>{c.stream}</td>
                      <td className="px-4 py-2 tabular-nums">{duration}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
