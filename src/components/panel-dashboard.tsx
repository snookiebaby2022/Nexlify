"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Play, Users, Zap, Layers, ChevronDown, ChevronRight } from "lucide-react";

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

import { DashboardServerCard, type ServerDashboardMetrics } from "@/components/dashboard-server-card";

import { formatDateTime } from "@/lib/format";

import { ConnectionMap } from "@/components/connection-map";

import { DashboardMostWatchedByCountry } from "@/components/dashboard-most-watched-by-country";

import { DashboardXuiSummaryCards } from "@/components/dashboard-xui-summary-cards";

import { DashboardExpiringLines } from "@/components/dashboard-expiring-lines";

import { DashboardInsightsPanels } from "@/components/dashboard-insights-panels";
import { DashboardCacheRebuild } from "@/components/dashboard-cache-rebuild";

import { DashboardXuiResourceMonitor } from "@/components/dashboard-xui-resource-monitor";

import { DashboardXuiKpiRibbon } from "@/components/dashboard-xui-kpi-ribbon";

import { DashboardXuiServerTiles } from "@/components/dashboard-xui-server-tiles";

import { DashboardLiveSports } from "@/components/dashboard-live-sports";

import { DashboardQuickActions } from "@/components/dashboard-quick-actions";

import { DashboardStackStrip } from "@/components/dashboard-stack-strip";

import { DashboardIssuesPanel } from "@/components/dashboard-issues-panel";

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

  const [stackItems, setStackItems] = useState<StackComponentStatus[]>([]);



  const load = useCallback(() => {
    const statsPromise = fetch(statsUrl).then((r) => (r.ok ? r.json() : {}));
    const analyticsPromise = isReseller
      ? Promise.resolve({})
      : fetch("/api/admin/analytics")
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}));

    Promise.all([statsPromise, analyticsPromise]).then(([statsData, analytics]) => {
      const a = (analytics ?? {}) as {
        topChannels?: { streamId?: string; name?: string; viewers?: number; type?: string; watchCount?: number }[];
      };
      const topChannels: TopChannel[] = Array.isArray(a.topChannels)
        ? a.topChannels.map((ch) => ({
            streamId: String(ch.streamId ?? ""),
            name: String(ch.name ?? "Unknown"),
            type: String(ch.type ?? "LIVE"),
            watchCount: Number(ch.watchCount ?? ch.viewers ?? 0),
          }))
        : [];
      setStats({
        ...statsData,
        topChannels,
      });
    });
  }, [statsUrl, isReseller]);



  useEffect(() => {

    load();

    const t = setInterval(load, 15000);

    return () => clearInterval(t);

  }, [load]);



  useEffect(() => {

    if (isReseller) return;

    fetch("/api/admin/stack/status")

      .then((r) => (r.ok ? r.json() : { items: [] }))

      .then((d) => setStackItems(d.items ?? []));

  }, [isReseller]);



  const d = stats?.dashboard;

  const connMax = d && d.maxConnections > 0 ? String(d.maxConnections) : "∞";

  const servers = stats?.serverMetrics ?? [];



  return (

    <div className="dashboard-v2 space-y-5">

      <header

        className="rounded-2xl border overflow-hidden"

        style={{ borderColor: "var(--border)" }}

      >

        <div

          className="px-5 py-5 sm:px-6"

          style={{

            background:

              "linear-gradient(135deg, rgba(0,192,239,0.15) 0%, rgba(168,85,247,0.12) 50%, transparent 100%)",

          }}

        >

          <div className="flex flex-wrap items-start justify-between gap-4">

            <div>

              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>

                Control center

              </p>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Dashboard</h1>

              <p className="text-sm mt-1 max-w-xl" style={{ color: "var(--muted)" }}>

                {isReseller

                  ? "Lines, connections, and subscriptions at a glance."

                  : "Streams, servers, transcoding, and GeoIP — one clean overview."}

              </p>

            </div>

            {!isReseller && (

              <Link

                href="/admin/streaming/health"

                className="text-xs px-3 py-2 rounded-lg border font-medium shrink-0"

                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}

              >

                Open stream health →

              </Link>

            )}

          </div>

          {!isReseller && (

            <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>

              <DashboardQuickActions />

            </div>

          )}

        </div>

      </header>



      {!isReseller && (

        <>

          <DashboardStackStrip items={stackItems} />

          <DashboardXuiKpiRibbon

            summary={d ?? undefined}

            kpi={stats?.dashboardKpi}

            connectionsHref={connectionsHref}

            linesHref={linesHref}

            streamsHref={streamsHref}

          />

          <DashboardIssuesPanel statsUrl={statsUrl} kpi={stats?.dashboardKpi} />

          <DashboardXuiSummaryCards widgetsUrl={widgetsUrl} />

        </>

      )}



      {!isReseller && servers.length > 0 && (

        <details open className="rounded-xl border text-sm group" style={{ borderColor: "var(--border)" }}>

          <summary className="px-4 py-3 cursor-pointer font-medium select-none flex items-center gap-2">

            <Layers size={16} style={{ color: "var(--accent)" }} />

            All servers ({servers.length})

          </summary>

          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

            {servers.map((s) => (

              <DashboardServerCard key={s.id} server={s} />

            ))}

          </div>

        </details>

      )}



      {!isReseller && !servers.length && (

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



      {showActivity && !isReseller && (

        <details open className="rounded-xl border text-sm" style={{ borderColor: "var(--border)" }}>

          <summary className="px-4 py-3 cursor-pointer font-medium select-none">

            Activity & cron

            {stats?.cronLastRun && (

              <span className="ml-2 font-normal text-xs" style={{ color: "var(--muted)" }}>

                · Cron {formatDateTime(stats.cronLastRun)}

              </span>

            )}

          </summary>

          <div

            className="grid lg:grid-cols-3 gap-4 p-4 pt-0 border-t"

            style={{ borderColor: "var(--border)" }}

          >

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

        </details>

      )}



      {!isReseller ? (

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

          <div className="xl:col-span-8 space-y-5">

            <DashboardXuiServerTiles servers={servers} />

            <DashboardXuiResourceMonitor serverMetrics={servers} summary={d ?? undefined} />

            <DashboardLiveSports />

          </div>

          <aside className="xl:col-span-4 space-y-5">

            <DashboardCard id="expiring-lines" title="Expiring in 7 days">
              <DashboardExpiringLines widgetsUrl={widgetsUrl} linesHref={linesHref} />
            </DashboardCard>

            <DashboardCard id="top-channels" title="Top channels">
              <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
                {(stats?.topChannels ?? []).slice(0, 6).map((ch) => (
                  <li key={ch.streamId} className="py-2 flex justify-between gap-2">
                    <span className="truncate text-xs">{ch.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">{ch.watchCount}</span>
                  </li>
                ))}
                {!stats?.topChannels?.length && (
                  <li className="py-4 text-center text-xs" style={{ color: "var(--muted)" }}>
                    No watch data yet
                  </li>
                )}
              </ul>
              <Link href="/admin/videolog" className="text-xs underline mt-2 inline-block" style={{ color: "var(--accent)" }}>
                Video log →
              </Link>
            </DashboardCard>

          </aside>

        </div>

      ) : (

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 xl:grid-cols-3">

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

        </div>

      )}



      <div className="grid lg:grid-cols-2 gap-5">

        <ConnectionMap />

        <DashboardMostWatchedByCountry widgetsUrl={widgetsUrl} />

      </div>



      {!isReseller && <DashboardInsightsPanels widgetsUrl={widgetsUrl} linesHref={linesHref} />}

    </div>

  );

}


