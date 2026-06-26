"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Play, Users, Zap, Layers } from "lucide-react";
import { Login3dLogo } from "@/components/login-3d-logo";
import { DashboardStatBox } from "@/components/dashboard-stat-box";
import { DashboardServerCard, type ServerDashboardMetrics } from "@/components/dashboard-server-card";
import { formatDateTime } from "@/lib/format";
import { ConnectionMap } from "@/components/connection-map";
import { DashboardMostWatchedByCountry } from "@/components/dashboard-most-watched-by-country";
import { DashboardXuiSummaryCards } from "@/components/dashboard-xui-summary-cards";
import { DashboardExpiringLines } from "@/components/dashboard-expiring-lines";
import { DashboardInsightsPanels } from "@/components/dashboard-insights-panels";

type ActivityLog = {
  action: string;
  label: string;
  createdAt: string;
  fixHref: string | null;
};

type CronLog = {
  job: string;
  status: string;
  createdAt: string;
  fixHref: string | null;
};

type DashboardSummary = {
  onlineStreams: number;
  totalLiveStreams: number;
  onlineUsers: number;
  totalActiveLines: number;
  onlineConnections: number;
  maxConnections: number;
  onlineServers: number;
  totalServers: number;
};

type TopChannel = {
  streamId: string;
  name: string;
  type: string;
  watchCount: number;
};

type Stats = {
  cronLastRun?: string | null;
  cronLogs?: CronLog[];
  logs?: ActivityLog[];
  dashboard?: DashboardSummary;
  serverMetrics?: ServerDashboardMetrics[];
  topChannels?: TopChannel[];
};

export type PanelDashboardProps = {
  statsUrl: string;
  widgetsUrl: string;
  linesHref: string;
  streamsHref: string;
  connectionsHref?: string;
  serversHref: string;
  addServerHref: string;
  showActivity?: boolean;
  /** Reseller dashboard hides server metrics and server info section */
  variant?: "admin" | "reseller";
};

export function PanelDashboard({
  statsUrl,
  widgetsUrl,
  linesHref,
  streamsHref,
  connectionsHref = "/admin/connections",
  serversHref,
  addServerHref,
  showActivity = true,
  variant = "admin",
}: PanelDashboardProps) {
  const isReseller = variant === "reseller";
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch(statsUrl).then((r) => r.json()),
      fetch("/api/admin/analytics").then((r) => r.json()).catch(() => ({})),
    ]).then(([statsData, analytics]) => {
      setStats({
        ...statsData,
        topChannels: analytics.topChannels ?? [],
      });
    });
  }, [statsUrl]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const d = stats?.dashboard;
  const connMax = d && d.maxConnections > 0 ? String(d.maxConnections) : "∞";
  const servers = stats?.serverMetrics ?? [];

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap items-center gap-4 rounded-xl border px-5 py-4"
        style={{
          borderColor: "var(--border)",
          background:
            "linear-gradient(135deg, var(--logo-accent-dashboard-bg) 0%, var(--logo-accent-dashboard-bg-2) 50%, transparent 100%)",
        }}
      >
        <Login3dLogo size="md" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            {isReseller
              ? "Your lines, connections, and subscription overview"
              : "Live overview of streams, users, connections, and servers"}
          </p>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${isReseller ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}
      >
        <DashboardStatBox
          variant="green"
          value={`${d?.onlineStreams ?? "—"} / ${d?.totalLiveStreams ?? "—"}`}
          label="Online Streams"
          icon={<Play size={28} fill="currentColor" strokeWidth={0} />}
          href={streamsHref}
          footerLabel="View streams"
        />
        <DashboardStatBox
          variant="blue"
          value={`${d?.onlineUsers ?? "—"} / ${d?.totalActiveLines ?? "—"}`}
          label="Online Users"
          icon={<Users size={28} />}
          href={linesHref}
        />
        <DashboardStatBox
          variant="orange"
          value={`${d?.onlineConnections ?? "—"} / ${connMax}`}
          label="Online Connections"
          icon={<Zap size={28} />}
          href={connectionsHref}
        />
        {!isReseller && (
          <DashboardStatBox
            variant="light"
            value={`${d?.onlineServers ?? "—"} / ${d?.totalServers ?? "—"}`}
            label="Online Servers"
            icon={<Layers size={28} style={{ color: "#666" }} />}
            href={serversHref}
          />
        )}
      </div>

      <DashboardMostWatchedByCountry widgetsUrl={widgetsUrl} />
      <DashboardXuiSummaryCards widgetsUrl={widgetsUrl} />
      <DashboardExpiringLines widgetsUrl={widgetsUrl} linesHref={linesHref} />
      <DashboardInsightsPanels widgetsUrl={widgetsUrl} linesHref={linesHref} />

      <div className="grid lg:grid-cols-2 gap-6">
        <ConnectionMap />
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <h3 className="text-sm font-semibold mb-3">Top channels (analytics)</h3>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {(stats?.topChannels ?? []).slice(0, 8).map((ch) => (
              <li key={ch.streamId} className="py-2 flex justify-between text-sm gap-2">
                <span className="truncate">
                  {ch.name}{" "}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    ({ch.type})
                  </span>
                </span>
                <span className="shrink-0 font-medium">{ch.watchCount}</span>
              </li>
            ))}
            {!stats?.topChannels?.length && (
              <li className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
                No watch data yet
              </li>
            )}
          </ul>
          <Link
            href="/admin/videolog"
            className="text-xs underline mt-3 inline-block"
            style={{ color: "var(--accent)" }}
          >
            Open video log
          </Link>
        </div>
      </div>

      {!isReseller && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Server info</h2>
          {servers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {servers.map((s) => (
                <DashboardServerCard key={s.id} server={s} />
              ))}
            </div>
          ) : (
            <div
              className="rounded-lg border p-8 text-center text-sm"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              No stream servers yet.{" "}
              {addServerHref ? (
                <Link href={addServerHref} className="underline" style={{ color: "var(--accent)" }}>
                  Add a server
                </Link>
              ) : (
                <span>Contact your administrator.</span>
              )}
            </div>
          )}
        </div>
      )}

      {showActivity && (
        <details className="rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
          <summary className="px-4 py-3 cursor-pointer font-medium select-none">
            Activity & cron
            {stats?.cronLastRun && (
              <span className="ml-2 font-normal text-xs" style={{ color: "var(--muted)" }}>
                · Cron {formatDateTime(stats.cronLastRun)}
              </span>
            )}
          </summary>
          <div
            className="grid lg:grid-cols-2 gap-4 p-4 pt-0 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <h3 className="text-sm font-medium mb-2">Recent activity</h3>
              <ul className="divide-y rounded border" style={{ borderColor: "var(--border)" }}>
                {(stats?.logs ?? []).map((log, i) => (
                  <li key={i} className="px-3 py-2 flex justify-between gap-2">
                    {log.fixHref ? (
                      <Link
                        href={log.fixHref}
                        className="hover:underline truncate"
                        style={{ color: "var(--accent)" }}
                      >
                        {log.label}
                      </Link>
                    ) : (
                      <span className="truncate">{log.label}</span>
                    )}
                    <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                      {formatDateTime(log.createdAt)}
                    </span>
                  </li>
                ))}
                {!stats?.logs?.length && (
                  <li className="px-3 py-4 text-center" style={{ color: "var(--muted)" }}>
                    No recent activity
                  </li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Cron jobs</h3>
              <ul className="divide-y rounded border" style={{ borderColor: "var(--border)" }}>
                {(stats?.cronLogs ?? []).map((log, i) => (
                  <li key={i} className="px-3 py-2 flex justify-between gap-2">
                    <span className="truncate">
                      {log.fixHref && log.status !== "ok" ? (
                        <Link href={log.fixHref} style={{ color: "var(--accent)" }}>
                          {log.job}
                        </Link>
                      ) : (
                        log.job
                      )}{" "}
                      <span style={{ color: log.status === "ok" ? "var(--success)" : "var(--danger)" }}>
                        ({log.status})
                      </span>
                    </span>
                    <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                      {formatDateTime(log.createdAt)}
                    </span>
                  </li>
                ))}
                {!stats?.cronLogs?.length && (
                  <li className="px-3 py-4 text-center" style={{ color: "var(--muted)" }}>
                    No cron runs yet
                  </li>
                )}
              </ul>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
