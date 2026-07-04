"use client";

import Link from "next/link";
import { Plus, Wifi, Users, Radio, Signal } from "lucide-react";
import { DashboardMetricBar } from "@/components/dashboard-metric-bar";
import { IpWithFlag } from "@/components/ip-with-flag";

export type ServerDashboardMetrics = {
  id: string;
  name: string;
  host: string;
  online: boolean;
  upload: number;
  download: number;
  memory: number;
  storage: number;
  cpu: number;
  connections?: number;
  users?: number;
  streamsOn?: number;
  streamsOff?: number;
};

export function DashboardServerCard({ server }: { server: ServerDashboardMetrics }) {
  const statusColor = server.online ? "#22c55e" : "#ef4444";
  const statusBg = server.online ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  return (
    <div
      className="rounded-xl border overflow-hidden shadow-sm transition-all hover:shadow-md"
      style={{
        borderColor: server.online ? "rgba(34,197,94,0.25)" : "var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          borderColor: "var(--border)",
          background: server.online
            ? "linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 100%)"
            : "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              background: statusColor,
              boxShadow: server.online ? `0 0 8px ${statusColor}60` : "none",
            }}
          />
          <Link
            href="/admin/servers"
            className="font-semibold text-sm truncate hover:underline"
            title={server.name}
          >
            {server.name}
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: statusBg, color: statusColor }}
          >
            {server.online ? "Online" : "Offline"}
          </span>
          <Link
            href="/admin/servers/add"
            className="p-1 rounded opacity-60 hover:opacity-100"
            style={{ color: "var(--muted)" }}
            title="Add server"
          >
            <Plus size={14} />
          </Link>
        </div>
      </div>
      <div className="p-4 space-y-2.5">
        <IpWithFlag ip={server.host} className="mb-2 text-xs" />

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-1.5 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
            <Wifi size={12} className="mx-auto mb-0.5" style={{ color: "var(--accent)" }} />
            <div className="text-xs font-bold tabular-nums">{server.connections ?? 0}</div>
            <div className="text-[9px]" style={{ color: "var(--muted)" }}>Conns</div>
          </div>
          <div className="text-center p-1.5 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
            <Users size={12} className="mx-auto mb-0.5" style={{ color: "var(--accent)" }} />
            <div className="text-xs font-bold tabular-nums">{server.users ?? 0}</div>
            <div className="text-[9px]" style={{ color: "var(--muted)" }}>Users</div>
          </div>
          <div className="text-center p-1.5 rounded-lg" style={{ background: "rgba(0,0,0,0.2)" }}>
            <Radio size={12} className="mx-auto mb-0.5" style={{ color: "var(--accent)" }} />
            <div className="text-xs font-bold tabular-nums">{server.streamsOn ?? 0}</div>
            <div className="text-[9px]" style={{ color: "var(--muted)" }}>Streams</div>
          </div>
        </div>

        <DashboardMetricBar label="CPU" percent={server.cpu} />
        <DashboardMetricBar label="Memory" percent={server.memory} />
        <DashboardMetricBar label="Storage" percent={server.storage} />
        <DashboardMetricBar label="Upload" percent={server.upload} />
        <DashboardMetricBar label="Download" percent={server.download} />
      </div>
    </div>
  );
}
