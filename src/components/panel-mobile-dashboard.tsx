"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Ticket, Play, Radio, Activity, Gauge } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { startVisibleInterval } from "@/lib/perf-polling";
import type { ExpiringLineRow } from "@/lib/dashboard-widgets";

type MobileDashProps = {
  variant: "admin" | "reseller";
  statsUrl: string;
  widgetsUrl: string;
  linesHref: string;
  streamsHref: string;
  connectionsHref: string;
  ticketsHref: string;
  dashboard?: {
    onlineStreams?: number;
    totalLiveStreams?: number;
    onlineUsers?: number;
    totalActiveLines?: number;
    onlineConnections?: number;
    maxConnections?: number;
    onlineServers?: number;
    totalServers?: number;
  };
  stackHealthy?: boolean;
};

function StatTile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="panel-mobile-stat-tile">
      <p className="panel-mobile-stat-tile-label">{label}</p>
      <p className="panel-mobile-stat-tile-value">{value}</p>
      {sub ? <p className="panel-mobile-stat-tile-sub">{sub}</p> : null}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="panel-mobile-stat-tile-link">
        {inner}
      </Link>
    );
  }
  return inner;
}

function QuickActionBtn({
  href,
  label,
  icon: Icon,
  color,
}: {
  href: string;
  label: string;
  icon: typeof Plus;
  color: string;
}) {
  return (
    <Link href={href} className="panel-mobile-quick-action">
      <Icon size={18} style={{ color }} />
      <span>{label}</span>
    </Link>
  );
}

export function PanelMobileDashboard({
  variant,
  widgetsUrl,
  linesHref,
  streamsHref,
  connectionsHref,
  ticketsHref,
  dashboard: d,
  stackHealthy = true,
}: MobileDashProps) {
  const isReseller = variant === "reseller";
  const [expiring, setExpiring] = useState<ExpiringLineRow[]>([]);
  const [search, setSearch] = useState("");

  const loadWidgets = useCallback(() => {
    fetch(widgetsUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { expiringLines?: ExpiringLineRow[] } | null) => {
        const rows = Array.isArray(data?.expiringLines) ? data.expiringLines : [];
        setExpiring(rows.slice(0, 8));
      })
      .catch(() => setExpiring([]));
  }, [widgetsUrl]);

  useEffect(() => {
    loadWidgets();
    return startVisibleInterval(loadWidgets, 120_000);
  }, [loadWidgets]);

  const connMax = d && d.maxConnections && d.maxConnections > 0 ? String(d.maxConnections) : "∞";
  const serverStatus = stackHealthy ? "● Healthy" : "● Check";

  const adminActions = [
    { href: "/admin/lines/add", label: "+ Add Line", icon: Plus, color: "#38bdf8" },
    { href: "/admin/content/streams/add", label: "+ Add Stream", icon: Play, color: "#22c55e" },
    { href: "/admin/tickets", label: "View Tickets", icon: Ticket, color: "#f97316" },
    { href: "/admin/diagnostics", label: "Diagnostics", icon: Gauge, color: "#f59e0b" },
    { href: connectionsHref, label: "Live Conns", icon: Activity, color: "#a78bfa" },
  ];

  const resellerActions = [
    { href: "/reseller/lines/add", label: "+ Add Line", icon: Plus, color: "#38bdf8" },
    { href: streamsHref, label: "Streams", icon: Play, color: "#22c55e" },
    { href: ticketsHref, label: "View Tickets", icon: Ticket, color: "#f97316" },
    { href: connectionsHref, label: "Live Conns", icon: Radio, color: "#a78bfa" },
  ];

  const actions = isReseller ? resellerActions : adminActions;

  const filteredExpiring = expiring.filter((line) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return line.username.toLowerCase().includes(q);
  });

  return (
    <div className="panel-mobile-dashboard space-y-4">
      <div className="panel-mobile-search-wrap">
        <input
          type="search"
          className="panel-mobile-search-input"
          placeholder="Search users, lines, channels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search panel"
        />
      </div>

      <div className="panel-mobile-stat-grid">
        <StatTile
          label="Active Users"
          value={String(d?.onlineUsers ?? d?.totalActiveLines ?? "—")}
          sub={d?.totalActiveLines != null ? `of ${d.totalActiveLines}` : undefined}
          href={linesHref}
        />
        <StatTile
          label="Watching now"
          value={String(d?.onlineStreams ?? "—")}
          sub={d?.totalLiveStreams != null ? `of ${d.totalLiveStreams}` : undefined}
          href={streamsHref}
        />
        <StatTile
          label="Live connections"
          value={String(d?.onlineConnections ?? "—")}
          sub={d?.maxConnections ? `max ${d.maxConnections}` : "watching now"}
          href={connectionsHref}
        />
        <StatTile
          label={isReseller ? "Connections" : "Server Status"}
          value={isReseller ? String(d?.onlineConnections ?? "—") : serverStatus}
          sub={isReseller ? `max ${connMax}` : `${d?.onlineServers ?? 0}/${d?.totalServers ?? 0} online`}
          href={isReseller ? connectionsHref : "/admin/servers"}
        />
      </div>

      <section>
        <h2 className="panel-mobile-section-title">Quick Actions</h2>
        <div className="panel-mobile-quick-actions">
          {actions.map((a) => (
            <QuickActionBtn key={a.href} {...a} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="panel-mobile-section-title mb-0">Recent Activity</h2>
          <Link href={linesHref} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
            View all
          </Link>
        </div>
        <div className="panel-mobile-activity-list">
          {filteredExpiring.map((line) => (
            <article key={line.id} className="panel-mobile-activity-card">
              <div className="panel-mobile-activity-card-body">
                <p className="panel-mobile-activity-card-title">{line.username}</p>
                <p className="panel-mobile-activity-card-meta">
                  <span
                    className="panel-mobile-status-badge panel-mobile-status-badge--active"
                  >
                    {line.daysLeft <= 0 ? "Expired" : "Active"}
                  </span>
                  {" · "}
                  Expires: {line.expiresAt ? formatDateTime(line.expiresAt).split(",")[0] : "—"}
                </p>
              </div>
              <Link
                href={`${linesHref}?edit=${line.id}`}
                className="panel-mobile-activity-manage"
              >
                Manage
                <ChevronRight size={16} />
              </Link>
            </article>
          ))}
          {filteredExpiring.length === 0 && (
            <p className="panel-mobile-empty">No expiring lines in the next 7 days.</p>
          )}
        </div>
      </section>
    </div>
  );
}
