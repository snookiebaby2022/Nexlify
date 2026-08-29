"use client";

import Link from "next/link";
import { Activity, ArrowDown, ArrowUp, Play, Users, Zap } from "lucide-react";
import type { DashboardKpiExtended } from "@/lib/dashboard-server-metrics";

type Summary = {
  onlineConnections?: number;
  onlineUsers?: number;
  onlineStreams?: number;
  totalLiveStreams?: number;
};

function KpiTile({
  label,
  value,
  sub,
  gradient,
  href,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  gradient: string;
  href?: string;
  icon?: React.ReactNode;
}) {
  const inner = (
    <div
      className="rounded-lg p-4 text-white h-full min-h-[88px] flex flex-col justify-between shadow-md"
      style={{ background: gradient }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-95">{label}</p>
          <p className="text-3xl font-extrabold tabular-nums mt-1 drop-shadow-sm">{value}</p>
        </div>
        {icon && <div className="opacity-80 shrink-0">{icon}</div>}
      </div>
      {sub && <div className="text-xs mt-2 opacity-100">{sub}</div>}
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

function MiniStat({
  label,
  value,
  pct,
  barColor,
  href,
}: {
  label: string;
  value: number;
  pct: number;
  barColor: string;
  href?: string;
}) {
  const body = (
    <div className="xui-dash-kpi-mini rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-8 h-8 rounded flex items-center justify-center text-lg" style={{ background: "rgba(148,163,184,0.12)" }}>{label.slice(0, 1)}</span>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {label}
          </p>
          <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
        </div>
      </div>
      <div className="flex justify-between text-[10px] uppercase mb-1" style={{ color: "var(--muted)" }}>
        <span>{label === "Unstable Stream" ? "Dead source" : label === "Dead Stream" ? "Hide stream" : "Last 24 hours"}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-95">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DashboardXuiKpiRibbon({
  summary,
  kpi,
  connectionsHref,
  linesHref,
  streamsHref,
}: {
  summary?: Summary;
  kpi?: DashboardKpiExtended;
  connectionsHref: string;
  linesHref: string;
  streamsHref: string;
}) {
  const totalLive = summary?.totalLiveStreams ?? 0;
  const onlineStreams = summary?.onlineStreams ?? 0;
  const offlineStreams = kpi?.offlineStreams ?? 0;
  const totalLines = (kpi?.paidUsers ?? 0) + (kpi?.trialUsers ?? 0);
  const paidPct = totalLines ? Math.round(((kpi?.paidUsers ?? 0) / totalLines) * 100) : 0;
  const trialPct = totalLines ? Math.round(((kpi?.trialUsers ?? 0) / totalLines) * 100) : 0;
  const unstablePct = totalLive ? Math.round(((kpi?.unstableStreams ?? 0) / totalLive) * 100) : 0;
  const deadPct = totalLive ? Math.round(((kpi?.deadStreams ?? 0) / totalLive) * 100) : 0;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          label="Open Connections"
          value={(summary?.onlineConnections ?? 0).toLocaleString()}
          gradient="linear-gradient(135deg, #00a65a 0%, #008d4c 100%)"
          href={connectionsHref}
          icon={<Zap size={28} />}
        />
        <KpiTile
          label="Online Users"
          value={(summary?.onlineUsers ?? 0).toLocaleString()}
          gradient="linear-gradient(135deg, #3c8dbc 0%, #2e6da4 100%)"
          href={linesHref}
          icon={<Users size={28} />}
        />
        <KpiTile
          label="Bandwidth"
          value={`${(kpi?.networkOutMbps ?? 0).toFixed(1)} Mbps`}
          gradient="linear-gradient(135deg, #ff9f1a 0%, #f39c12 45%, #e67e22 100%)"
          href="/admin/servers"
          icon={<Activity size={28} />}
          sub={
            <div className="space-y-1 text-[13px] font-semibold tracking-wide">
              <div className="flex items-center gap-1.5">
                <ArrowUp size={14} strokeWidth={2.5} />
                Output { (kpi?.networkOutMbps ?? 0).toFixed(1) } Mbps
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowDown size={14} strokeWidth={2.5} />
                Input { (kpi?.networkInMbps ?? 0).toFixed(1) } Mbps
              </div>
            </div>
          }
        />
        <div className="rounded-lg overflow-hidden shadow-md flex flex-col min-h-[88px]">
          <Link
            href="/admin/content/streams?status=online"
            className="flex-1 px-4 py-3 text-white flex items-center justify-between"
            style={{ background: "linear-gradient(135deg, #00a65a 0%, #008d4c 100%)" }}
          >
            <div>
              <p className="text-xs uppercase opacity-90">Watching now</p>
              <p className="text-2xl font-bold tabular-nums">{onlineStreams.toLocaleString()}</p>
            </div>
            <Play size={24} fill="white" strokeWidth={0} />
          </Link>
          <Link
            href="/admin/content/streams?status=offline"
            className="px-4 py-2 text-white text-sm flex items-center justify-between"
            style={{ background: "linear-gradient(135deg, #dd4b39 0%, #c23321 100%)" }}
          >
            <span className="uppercase text-xs opacity-90">Probe failed</span>
            <span className="font-bold tabular-nums">{offlineStreams.toLocaleString()}</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MiniStat label="Paid Users" value={kpi?.paidUsers ?? 0} pct={paidPct} barColor="#00a65a" href={linesHref} />
        <MiniStat label="Trial Users" value={kpi?.trialUsers ?? 0} pct={trialPct} barColor="#17a2b8" href={linesHref} />
        <MiniStat
          label="Unstable Stream"
          value={kpi?.unstableStreams ?? 0}
          pct={unstablePct}
          barColor="#f39c12"
          href="/admin/stream_health"
        />
        <MiniStat label="Dead Stream" value={kpi?.deadStreams ?? 0} pct={deadPct} barColor="#dd4b39" href="/admin/stream_errors" />
      </div>

      {(kpi?.reportedChannels || kpi?.channelRequests) ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/admin/tickets?status=OPEN"
          className="rounded-lg border px-4 py-3 flex flex-col gap-2 hover:opacity-95"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">User Reported Channels</span>
            <span className="text-xl font-bold tabular-nums">{kpi?.reportedChannels ?? 0}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
            <span>
              Channels{" "}
              <strong className="tabular-nums" style={{ color: "var(--text)" }}>
                {kpi?.reportedBreakdown?.channels ?? 0}
              </strong>
            </span>
            <span>
              Movies{" "}
              <strong className="tabular-nums" style={{ color: "var(--text)" }}>
                {kpi?.reportedBreakdown?.movies ?? 0}
              </strong>
            </span>
            <span>
              TV Series / Episodes{" "}
              <strong className="tabular-nums" style={{ color: "var(--text)" }}>
                {kpi?.reportedBreakdown?.series ?? 0}
              </strong>
            </span>
          </div>
        </Link>
        <Link
          href="/admin/tickets?status=OPEN"
          className="rounded-lg border px-4 py-3 flex flex-col gap-2 hover:opacity-95"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">New Channels Add Request</span>
            <span className="text-xl font-bold tabular-nums">{kpi?.channelRequests ?? 0}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
            <span>
              Channels{" "}
              <strong className="tabular-nums" style={{ color: "var(--text)" }}>
                {kpi?.requestBreakdown?.channels ?? 0}
              </strong>
            </span>
            <span>
              Movies{" "}
              <strong className="tabular-nums" style={{ color: "var(--text)" }}>
                {kpi?.requestBreakdown?.movies ?? 0}
              </strong>
            </span>
            <span>
              TV Series / Episodes{" "}
              <strong className="tabular-nums" style={{ color: "var(--text)" }}>
                {kpi?.requestBreakdown?.series ?? 0}
              </strong>
            </span>
          </div>
        </Link>
      </div>
      ) : null}
    </section>
  );
}
