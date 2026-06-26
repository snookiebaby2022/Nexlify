"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
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
};

export function DashboardServerCard({ server }: { server: ServerDashboardMetrics }) {
  const nameColor = server.online ? "#22c55e" : "#ef4444";
  return (
    <div
      className="rounded border overflow-hidden shadow-sm"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
      >
        <Link
          href="/admin/servers"
          className="font-semibold text-sm truncate hover:underline"
          style={{ color: nameColor }}
          title={server.name}
        >
          {server.name}
        </Link>
        <Link
          href="/admin/servers/add"
          className="p-1 rounded opacity-60 hover:opacity-100"
          style={{ color: "var(--muted)" }}
          title="Add server"
        >
          <Plus size={16} />
        </Link>
      </div>
      <div className="p-3 space-y-2">
        <IpWithFlag ip={server.host} className="mb-1" />
        <DashboardMetricBar label="Upload" percent={server.upload} />
        <DashboardMetricBar label="Download" percent={server.download} />
        <DashboardMetricBar label="Memory" percent={server.memory} />
        <DashboardMetricBar label="Storage" percent={server.storage} />
        <DashboardMetricBar label="CPU" percent={server.cpu} />
      </div>
    </div>
  );
}
