"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TicketAlertItem = {
  id: string;
  ref: string;
  subject: string;
  status: string;
  priority: string;
  email: string;
  name: string | null;
  updatedAt: string;
};

export type TicketAlerts = {
  needsAttention: number;
  openCount: number;
  latest: TicketAlertItem[];
};

const EMPTY: TicketAlerts = { needsAttention: 0, openCount: 0, latest: [] };

export function useAdminTicketAlerts(opts?: {
  enabled?: boolean;
  pollMs?: number;
  desktopNotify?: boolean;
}) {
  const enabled = opts?.enabled !== false;
  const pollMs = opts?.pollMs ?? 30_000;
  const desktopNotify = opts?.desktopNotify === true;
  const [alerts, setAlerts] = useState<TicketAlerts>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const prevNeeds = useRef<number | null>(null);
  const baseTitle = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/admin/tickets/alerts", { cache: "no-store" });
      if (res.status === 403) {
        setAlerts(EMPTY);
        return;
      }
      if (!res.ok) throw new Error("Failed to load ticket alerts");
      const data = (await res.json()) as TicketAlerts;
      const next: TicketAlerts = {
        needsAttention: Number(data.needsAttention) || 0,
        openCount: Number(data.openCount) || 0,
        latest: Array.isArray(data.latest) ? data.latest : [],
      };

      if (
        desktopNotify &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        prevNeeds.current != null &&
        next.needsAttention > prevNeeds.current
      ) {
        const newest = next.latest[0];
        const body = newest
          ? `${newest.ref} · ${newest.subject}`
          : `${next.needsAttention} ticket(s) need a reply`;
        try {
          new Notification("Nexlify support ticket", {
            body,
            tag: "nexlify-ticket-alert",
          });
        } catch {
          /* ignore */
        }
      }

      prevNeeds.current = next.needsAttention;
      setAlerts(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alert poll failed");
    }
  }, [desktopNotify, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const id = window.setInterval(() => void load(), pollMs);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, load, pollMs]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (baseTitle.current == null) baseTitle.current = document.title.replace(/^\(\d+\)\s*/, "");
    const base = baseTitle.current;
    document.title =
      alerts.needsAttention > 0 ? `(${alerts.needsAttention}) ${base}` : base;
    return () => {
      if (baseTitle.current) document.title = baseTitle.current;
    };
  }, [alerts.needsAttention]);

  return { alerts, error, refresh: load };
}

export async function requestTicketDesktopPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}
