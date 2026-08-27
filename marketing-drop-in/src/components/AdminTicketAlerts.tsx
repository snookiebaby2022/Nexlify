"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  requestTicketDesktopPermission,
  useAdminTicketAlerts,
} from "@/hooks/useAdminTicketAlerts";

/** Sticky admin banner + optional desktop notifications for tickets needing a reply. */
export function AdminTicketAlertsBanner({
  onOpenTickets,
}: {
  onOpenTickets?: () => void;
}) {
  const [desktopOn, setDesktopOn] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const { alerts, refresh } = useAdminTicketAlerts({
    pollMs: 25_000,
    desktopNotify: desktopOn,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") setDesktopOn(true);
  }, []);

  const dismissKey =
    alerts.needsAttention > 0
      ? `${alerts.needsAttention}:${alerts.latest[0]?.id ?? ""}:${alerts.latest[0]?.updatedAt ?? ""}`
      : null;
  const visible = Boolean(dismissKey && dismissKey !== dismissedKey);

  if (!visible || alerts.needsAttention <= 0) return null;

  const top = alerts.latest[0];

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-50 shadow-lg shadow-amber-950/20">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold text-amber-100">
            {alerts.needsAttention} ticket{alerts.needsAttention === 1 ? "" : "s"} need
            {alerts.needsAttention === 1 ? "s" : ""} your reply
          </p>
          {top ? (
            <p className="text-amber-100/80">
              Latest: <span className="font-mono text-amber-200">{top.ref}</span> · {top.subject}{" "}
              <span className="text-amber-200/70">({top.email})</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {onOpenTickets ? (
              <button
                type="button"
                onClick={onOpenTickets}
                className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                View tickets
              </button>
            ) : (
              <Link
                href="/admin/tickets"
                className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                View tickets
              </Link>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-full border border-amber-400/40 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20"
            >
              Refresh
            </button>
            {!desktopOn && typeof window !== "undefined" && "Notification" in window ? (
              <button
                type="button"
                onClick={async () => {
                  const p = await requestTicketDesktopPermission();
                  if (p === "granted") setDesktopOn(true);
                }}
                className="rounded-full border border-amber-400/40 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20"
              >
                Enable desktop alerts
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss ticket alert"
          className="rounded-lg p-1 text-amber-200/70 hover:bg-amber-500/20 hover:text-amber-50"
          onClick={() => dismissKey && setDismissedKey(dismissKey)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Compact badge for nav labels. */
export function TicketAttentionBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950 ${className}`}
      aria-label={`${count} tickets need attention`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Site-wide floating pill for admins (navbar companion). */
export function AdminTicketNavBadge() {
  const { alerts } = useAdminTicketAlerts({ pollMs: 45_000, desktopNotify: true });
  if (alerts.needsAttention <= 0) return null;
  return (
    <Link
      href="/admin?tab=tickets"
      className="relative inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
      title={`${alerts.needsAttention} support ticket(s) need a reply`}
    >
      <Bell className="h-3.5 w-3.5" />
      Tickets
      <TicketAttentionBadge count={alerts.needsAttention} />
    </Link>
  );
}
