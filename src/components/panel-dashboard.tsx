"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Play, Users, Zap, ChevronDown, ChevronRight } from "lucide-react";
import { STREAM_HEALTH_CHANGED } from "@/lib/stream-health-events";
import { resolveClientPollIntervals, startVisibleInterval } from "@/lib/perf-polling";
import { usePanelLayout } from "@/lib/use-panel-layout";

const ADMIN_POLLS = resolveClientPollIntervals();

const LS_COLLAPSE_KEY = "nx-dash-sections";

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(LS_COLLAPSE_KEY) || "{}");
  } catch {
    return {};
  }
}

function DashboardCard({
  id,
  title,
  titleExtra,
  children,
  className = "",
}: {
  id: string;
  title: string;
  titleExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsed(loadCollapsed());
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(LS_COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });
  }, [id]);

  const isCollapsed = !!collapsed[id];

  return (
    <div
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          {title}
        </button>
        {titleExtra}
      </div>
      {!isCollapsed && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

import { DashboardStatBox } from "@/components/dashboard-stat-box";

import { type ServerDashboardMetrics } from "@/components/dashboard-server-card";
import { DashboardXuiServerTiles } from "@/components/dashboard-xui-server-tiles";

import { formatDateTime } from "@/lib/format";

import { ConnectionMap } from "@/components/connection-map";

import { DashboardMostWatchedByCountry } from "@/components/dashboard-most-watched-by-country";

import { DashboardXuiSummaryCards } from "@/components/dashboard-xui-summary-cards";

import { DashboardExpiringLines } from "@/components/dashboard-expiring-lines";

import { DashboardInsightsPanels } from "@/components/dashboard-insights-panels";
import { DashboardCacheRebuild } from "@/components/dashboard-cache-rebuild";

import { DashboardXuiResourceMonitor } from "@/components/dashboard-xui-resource-monitor";

import { DashboardXuiKpiRibbon } from "@/components/dashboard-xui-kpi-ribbon";
import { DashboardCapacityStrip } from "@/components/dashboard-capacity-strip";
import { useDashboardLiveMetrics } from "@/components/dashboard-live-metrics";

import { DashboardLiveSports } from "@/components/dashboard-live-sports";

import { DashboardQuickActions } from "@/components/dashboard-quick-actions";

import { PanelMobileDashboard } from "@/components/panel-mobile-dashboard";

import { DashboardStackStrip } from "@/components/dashboard-stack-strip";

import { DashboardIssuesPanel } from "@/components/dashboard-issues-panel";
import { LazyDashboardSection } from "@/components/lazy-dashboard-section";
import { DashboardWidgetsProvider } from "@/components/dashboard-widgets-context";

import type { DashboardKpiExtended } from "@/lib/dashboard-server-metrics";

import type { StackComponentStatus } from "@/lib/nexlify-stack";



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

  dashboardKpi?: DashboardKpiExtended;

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

  variant?: "admin" | "reseller";

  initialStats?: Stats | null;

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

  initialStats = null,

}: PanelDashboardProps) {

  const isReseller = variant === "reseller";
  const { isMdUp } = usePanelLayout();

  const [stats, setStats] = useState<Stats | null>(initialStats);
  const [stackItems, setStackItems] = useState<StackComponentStatus[]>([]);
  const { data: liveStats, connected: liveConnected } = useDashboardLiveMetrics();



  const loadHeader = useCallback(() => {
    fetch(`${statsUrl}?light=1`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((header) => {
        setStats((prev) => ({
          ...(prev ?? {}),
          ...header,
        }));
      })
      .catch(() => {});
  }, [statsUrl]);

  const loadFull = useCallback(() => {
    fetch(statsUrl)
      .then((r) => (r.ok ? r.json() : {}))
      .then((statsData) => {
        setStats((prev) => ({
          ...(prev ?? {}),
          ...statsData,
        }));
      })
      .catch(() => {});
  }, [statsUrl]);

  useEffect(() => {
    if (!isMdUp) return;
    loadHeader();
    let cancelled = false;
    const runFull = () => {
      if (!cancelled) loadFull();
    };
    const idleId =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(runFull, { timeout: 2500 })
        : null;
    const timeoutId = idleId == null ? setTimeout(runFull, 800) : null;
    const t = startVisibleInterval(loadFull, isReseller ? 45000 : ADMIN_POLLS.dashboardMs);
    const onHealth = () => loadFull();
    window.addEventListener(STREAM_HEALTH_CHANGED, onHealth);
    return () => {
      cancelled = true;
      window.removeEventListener(STREAM_HEALTH_CHANGED, onHealth);
      if (idleId != null && typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
      t();
    };
  }, [loadHeader, loadFull, isReseller, isMdUp]);



  useEffect(() => {

    if (isReseller || !isMdUp) return;

    fetch("/api/admin/stack/status")

      .then((r) => (r.ok ? r.json() : { items: [] }))

      .then((d) => setStackItems(d.items ?? []));

  }, [isReseller, isMdUp]);



  const d = stats?.dashboard;
  const liveSummary = liveStats && liveConnected
    ? {
        onlineConnections: liveStats.onlineConnections,
        onlineUsers: liveStats.onlineUsers,
        // Keep probe-based online count from stats (matches Online Stream card click filter)
        onlineStreams: liveStats.onlineStreams,
        totalLiveStreams: d?.totalLiveStreams,
        totalActiveLines: d?.totalActiveLines,
      }
    : d ?? undefined;
  const liveKpi =
    liveStats && liveConnected
      ? {
          ...(stats?.dashboardKpi ?? {
            paidUsers: 0,
            trialUsers: 0,
            unstableStreams: 0,
            deadStreams: 0,
            reportedChannels: 0,
            channelRequests: 0,
            reportedBreakdown: { channels: 0, movies: 0, series: 0 },
            requestBreakdown: { channels: 0, movies: 0, series: 0 },
            networkInMbps: 0,
            networkOutMbps: 0,
            inactiveStreams: 0,
            inactiveLive: 0,
            inactiveMovies: 0,
            inactiveSeries: 0,
            offlineStreams: 0,
            openTickets: 0,
          }),
          networkInMbps: liveStats.networkInMbps,
          networkOutMbps: liveStats.networkOutMbps,
        }
      : stats?.dashboardKpi;

  const connMax = d && d.maxConnections > 0 ? String(d.maxConnections) : "∞";

  const servers = stats?.serverMetrics ?? [];



  const ticketsHref = isReseller ? "/reseller/tickets" : "/admin/tickets";
  const stackHealthy = stackItems.length === 0 || stackItems.every((s) => s.ok);



  return (

    <>
    <div className="md:hidden">
      <PanelMobileDashboard
        variant={variant}
        statsUrl={statsUrl}
        widgetsUrl={widgetsUrl}
        linesHref={linesHref}
        streamsHref={streamsHref}
        connectionsHref={connectionsHref}
        ticketsHref={ticketsHref}
        dashboard={d ?? undefined}
        stackHealthy={stackHealthy}
      />
    </div>

    <div className="dashboard-v2 space-y-5 hidden md:block">

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        {!isReseller && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/streaming/health"
              className="text-xs px-3 py-1.5 rounded-lg border font-medium"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              Stream health
            </Link>
            <DashboardQuickActions />
          </div>
        )}
      </header>

      {!isReseller && (
        <DashboardWidgetsProvider widgetsUrl={widgetsUrl}>
        <>
          <DashboardXuiKpiRibbon
            summary={liveSummary}
            kpi={liveKpi}
            connectionsHref={connectionsHref}
            linesHref={linesHref}
            streamsHref={streamsHref}
          />
          <LazyDashboardSection minHeight="3rem">
            <DashboardCapacityStrip />
          </LazyDashboardSection>
          <DashboardIssuesPanel statsUrl={statsUrl} kpi={stats?.dashboardKpi} hideWhenHealthy />
          {servers.length > 0 ? (
            <DashboardXuiServerTiles servers={servers} />
          ) : (
            <div
              className="rounded-xl border p-6 text-center text-sm"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              No stream servers yet.{" "}
              <Link href={addServerHref} className="underline" style={{ color: "var(--accent)" }}>
                Install your first server
              </Link>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard id="expiring-lines" title="Expiring in 7 days">
              <LazyDashboardSection minHeight="6rem">
                <DashboardExpiringLines widgetsUrl={widgetsUrl} linesHref={linesHref} />
              </LazyDashboardSection>
            </DashboardCard>
            <DashboardMostWatchedByCountry widgetsUrl={widgetsUrl} />
          </div>
          <details className="rounded-xl border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <summary className="px-4 py-3 cursor-pointer font-medium select-none">
              More — stack, activity, globe, insights
            </summary>
            <div className="p-4 pt-0 space-y-4 border-t" style={{ borderColor: "var(--border)" }}>
              <DashboardStackStrip items={stackItems} />
              {showActivity ? (
                <div className="grid lg:grid-cols-3 gap-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Recent activity</h3>
                    <ul className="divide-y rounded border max-h-48 overflow-auto" style={{ borderColor: "var(--border)" }}>
                      {(stats?.logs ?? []).map((log, i) => (
                        <li key={i} className="px-3 py-2 flex justify-between gap-2 text-xs">
                          {log.fixHref ? (
                            <Link href={log.fixHref} className="hover:underline truncate" style={{ color: "var(--accent)" }}>
                              {log.label}
                            </Link>
                          ) : (
                            <span className="truncate">{log.label}</span>
                          )}
                          <span className="shrink-0" style={{ color: "var(--muted)" }}>
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
                    <ul className="divide-y rounded border max-h-48 overflow-auto" style={{ borderColor: "var(--border)" }}>
                      {(stats?.cronLogs ?? []).map((log, i) => (
                        <li key={i} className="px-3 py-2 flex justify-between gap-2 text-xs">
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
                          <span className="shrink-0" style={{ color: "var(--muted)" }}>
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
                  <DashboardCacheRebuild />
                </div>
              ) : null}
              <LazyDashboardSection minHeight="8rem">
                <DashboardLiveSports />
              </LazyDashboardSection>
              <LazyDashboardSection minHeight="16rem">
                <ConnectionMap />
              </LazyDashboardSection>
              <LazyDashboardSection minHeight="10rem">
                <DashboardXuiResourceMonitor serverMetrics={servers} summary={d ?? undefined} />
              </LazyDashboardSection>
              <LazyDashboardSection minHeight="5rem">
                <DashboardXuiSummaryCards widgetsUrl={widgetsUrl} />
              </LazyDashboardSection>
              <LazyDashboardSection minHeight="10rem">
                <DashboardInsightsPanels widgetsUrl={widgetsUrl} linesHref={linesHref} />
              </LazyDashboardSection>
            </div>
          </details>
        </>
        </DashboardWidgetsProvider>
      )}

      {isReseller ? (

        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-3">

          <DashboardStatBox

            variant="green"

            value={`${liveSummary?.onlineStreams ?? d?.onlineStreams ?? "—"} / ${liveSummary?.totalLiveStreams ?? d?.totalLiveStreams ?? "—"}`}

            label="Watching now"

            icon={<Play size={28} fill="currentColor" strokeWidth={0} />}

            href={`${streamsHref.split("?")[0]}?status=online`}

            footerLabel="View streams"

          />

          <DashboardStatBox

            variant="blue"

            value={`${liveSummary?.onlineUsers ?? d?.onlineUsers ?? "—"} / ${liveSummary?.totalActiveLines ?? d?.totalActiveLines ?? "—"}`}

            label="Online Users"

            icon={<Users size={28} />}

            href={linesHref}

          />

          <DashboardStatBox

            variant="orange"

            value={`${liveSummary?.onlineConnections ?? d?.onlineConnections ?? "—"} / ${connMax}`}

            label="Online Connections"

            icon={<Zap size={28} />}

            href={connectionsHref}

          />

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard id="reseller-expiring" title="Lines expiring soon">
              <LazyDashboardSection minHeight="6rem">
                <DashboardExpiringLines widgetsUrl={widgetsUrl} linesHref={linesHref} />
              </LazyDashboardSection>
            </DashboardCard>
            <DashboardMostWatchedByCountry widgetsUrl={widgetsUrl} />
          </div>

          <LazyDashboardSection minHeight="16rem">
            <ConnectionMap apiUrl="/api/admin/connection-map" />
          </LazyDashboardSection>

          <LazyDashboardSection minHeight="8rem">
            <DashboardXuiSummaryCards widgetsUrl={widgetsUrl} />
          </LazyDashboardSection>
        </>

      ) : null}

    </div>
    </>

  );

}


