"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FlaskConical,
  LifeBuoy,
  Radio,
  TrendingUp,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { TicketBadge } from "@/components/ticket-ui";
import type {
  DashboardWidgetsPayload,
  LowCreditRow,
  OfflineStreamRow,
  TicketQueueRow,
  TopResellerRow,
  TrialLineRow,
} from "@/lib/dashboard-widgets";

function Panel({
  title,
  icon,
  count,
  href,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  href?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-4 h-full"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        {count !== undefined && (
          <span
            className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: "var(--border)", color: "var(--muted)" }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
      {href && (
        <Link
          href={href}
          className="text-xs underline mt-3 inline-block"
          style={{ color: "var(--accent)" }}
        >
          View all
        </Link>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
      {text}
    </p>
  );
}

function TrialLinesTable({
  rows,
  linesHref,
  showOwner,
}: {
  rows: TrialLineRow[];
  linesHref: string;
  showOwner: boolean;
}) {
  if (rows.length === 0) return <Empty text="No trial lines expiring soon" />;
  return (
    <ul className="space-y-2 text-xs">
      {rows.map((line) => (
        <li
          key={line.id}
          className="flex justify-between gap-2 border-b pb-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-0">
            <Link
              href={`${linesHref}?edit=${line.id}`}
              className="font-medium hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {line.username}
            </Link>
            {showOwner && line.ownerUsername && (
              <p className="truncate" style={{ color: "var(--muted)" }}>
                {line.ownerUsername}
              </p>
            )}
          </div>
          <span className="shrink-0 font-semibold" style={{ color: "#f39c12" }}>
            {line.daysLeft === 0 ? "Today" : `${line.daysLeft}d`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OfflineStreamsList({ rows, streamsHref }: { rows: OfflineStreamRow[]; streamsHref: string }) {
  if (rows.length === 0) return <Empty text="All live streams are healthy" />;
  return (
    <ul className="space-y-2 text-xs">
      {rows.map((s) => (
        <li key={s.id} className="border-b pb-2" style={{ borderColor: "var(--border)" }}>
          <Link
            href={`${streamsHref}?edit=${s.id}`}
            className="font-medium hover:underline truncate block"
            style={{ color: "var(--accent)" }}
          >
            {s.name}
          </Link>
          <p className="truncate mt-0.5" style={{ color: "var(--danger)" }}>
            {s.lastProbeError ?? "Probe failed or pending"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function TicketsList({ rows, ticketsHref }: { rows: TicketQueueRow[]; ticketsHref: string }) {
  if (rows.length === 0) return <Empty text="No open tickets" />;
  return (
    <ul className="space-y-2 text-xs">
      {rows.map((t) => (
        <li key={t.id} className="border-b pb-2" style={{ borderColor: "var(--border)" }}>
          <Link
            href={`${ticketsHref}/${t.id}`}
            className="font-medium hover:underline line-clamp-1"
            style={{ color: "var(--accent)" }}
          >
            {t.subject}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <TicketBadge kind="status" value={t.status} />
            <TicketBadge kind="priority" value={t.priority} />
            <span style={{ color: "var(--muted)" }}>{formatDateTime(t.updatedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TopResellersList({ rows }: { rows: TopResellerRow[] }) {
  if (rows.length === 0) return <Empty text="No reseller activity yet" />;
  return (
    <ul className="space-y-2 text-xs">
      {rows.map((r) => (
        <li
          key={r.userId}
          className="flex justify-between gap-2 border-b pb-2"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="font-medium truncate">{r.username}</span>
          <span className="shrink-0" style={{ color: "var(--muted)" }}>
            {r.lines} lines · {r.connections} conn
          </span>
        </li>
      ))}
    </ul>
  );
}

function LowCreditsList({ rows }: { rows: LowCreditRow[] }) {
  if (rows.length === 0) return <Empty text="All resellers have sufficient credits" />;
  return (
    <ul className="space-y-2 text-xs">
      {rows.map((r) => (
        <li
          key={r.userId}
          className="flex justify-between gap-2 border-b pb-2"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="font-medium">{r.username}</span>
          <span className="font-semibold" style={{ color: "var(--danger)" }}>
            {r.credits.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardInsightsPanels({
  widgetsUrl,
  linesHref,
}: {
  widgetsUrl: string;
  linesHref: string;
}) {
  const [data, setData] = useState<DashboardWidgetsPayload | null>(null);

  const load = useCallback(() => {
    fetch(widgetsUrl)
      .then((r) => r.json())
      .then((payload: DashboardWidgetsPayload) => setData(payload))
      .catch(() => setData(null));
  }, [widgetsUrl]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return null;

  return (
    <div className="space-y-4" data-dashboard-insights>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="Trial lines expiring"
          icon={<FlaskConical size={16} style={{ color: "#a78bfa" }} />}
          count={data.trialExpiringLines?.length ?? 0}
          href={linesHref}
        >
          <TrialLinesTable
            rows={data.trialExpiringLines ?? []}
            linesHref={linesHref}
            showOwner={data.showOwner}
          />
        </Panel>

        {data.showOfflineStreams && (
          <Panel
            title="Offline streams"
            icon={<Radio size={16} style={{ color: "var(--danger)" }} />}
            count={data.streamHealth?.offline ?? 0}
            href={data.streamsHref}
          >
            <OfflineStreamsList
              rows={data.streamHealth?.offlineStreams ?? []}
              streamsHref={data.streamsHref}
            />
          </Panel>
        )}

        <Panel
          title="Open tickets"
          icon={<LifeBuoy size={16} style={{ color: "#60a5fa" }} />}
          count={(data.tickets?.open ?? 0) + (data.tickets?.inProgress ?? 0)}
          href={data.ticketsHref}
        >
          <TicketsList rows={data.tickets?.rows ?? []} ticketsHref={data.ticketsHref} />
        </Panel>

        {data.showTopResellers && (
          <Panel
            title="Top resellers"
            icon={<TrendingUp size={16} style={{ color: "#34d399" }} />}
            href="/admin/resellers"
          >
            <TopResellersList rows={data.topResellers ?? []} />
          </Panel>
        )}

        {data.showTopResellers && (
          <Panel
            title="Low credit resellers"
            icon={<AlertTriangle size={16} style={{ color: "#f39c12" }} />}
            count={data.lowCredits?.length ?? 0}
            href="/admin/resellers/credits"
          >
            <LowCreditsList rows={data.lowCredits ?? []} />
          </Panel>
        )}

        {data.bandwidth && (
          <Panel title="Latest bandwidth snapshot" icon={<TrendingUp size={16} style={{ color: "#17a2b8" }} />}>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <p style={{ color: "var(--muted)" }}>In</p>
                <p className="text-lg font-bold mt-1">{data.bandwidth.inPerMin.toLocaleString()}</p>
              </div>
              <div>
                <p style={{ color: "var(--muted)" }}>Out</p>
                <p className="text-lg font-bold mt-1">{data.bandwidth.outPerMin.toLocaleString()}</p>
              </div>
              <div>
                <p style={{ color: "var(--muted)" }}>Conns</p>
                <p className="text-lg font-bold mt-1">{data.bandwidth.connections}</p>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
