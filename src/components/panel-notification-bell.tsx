"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Megaphone, Pin } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { coloredIcon } from "@/lib/nav-item-icons";
import type { PanelNotificationRow } from "@/lib/panel-notifications";

const KIND_LABEL: Record<string, string> = {
  UPDATE: "Update",
  MESSAGE: "Message",
  ALERT: "Alert",
};

const PRIORITY_COLOR: Record<string, string> = {
  NORMAL: "#5eb8e8",
  HIGH: "#fb923c",
  URGENT: "#f87171",
};

export function PanelNotificationBell({
  role,
}: {
  role: "ADMIN" | "RESELLER";
}) {
  const inboxHref = role === "ADMIN" ? "/admin/notifications" : "/reseller/notifications";
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<PanelNotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadUnread = useCallback(() => {
    fetch("/api/panel/notifications/unread")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  const loadRecent = useCallback(() => {
    setLoading(true);
    fetch("/api/panel/notifications?limit=6")
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((d) => setRecent(d.notifications ?? []))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 60000);
    const onUpdate = () => loadUnread();
    window.addEventListener("nexlify-notifications-updated", onUpdate);
    return () => {
      clearInterval(t);
      window.removeEventListener("nexlify-notifications-updated", onUpdate);
    };
  }, [loadUnread]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      loadRecent();
      loadUnread();
    }
  }

  async function markRead(id: string) {
    await fetch(`/api/panel/notifications/${id}/read`, { method: "POST" });
    loadUnread();
    setRecent((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n
      )
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="relative p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
        title="Notifications"
        aria-expanded={open}
        aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
      >
        {coloredIcon(Bell, "#fbbf24", 20)}
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: "#ef4444" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-[min(92vw,360px)] rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="font-semibold text-sm flex items-center gap-2">
              {coloredIcon(Megaphone, "#5eb8e8", 16)}
              Notifications
            </span>
            {count > 0 && (
              <span className="text-xs font-medium" style={{ color: "#f87171" }}>
                {count} unread
              </span>
            )}
          </div>

          <div className="max-h-[min(60vh,320px)] overflow-y-auto">
            {loading && (
              <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--muted)" }}>
                Loading…
              </p>
            )}
            {!loading && recent.length === 0 && (
              <p className="px-4 py-8 text-sm text-center" style={{ color: "var(--muted)" }}>
                No notifications
              </p>
            )}
            {!loading &&
              recent.map((n) => {
                const unread = !n.readAt;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (unread) void markRead(n.id);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 border-b cursor-pointer hover:bg-black/5 transition-colors"
                    style={{
                      borderColor: "var(--border)",
                      background: unread ? "rgba(94,184,232,0.06)" : "transparent",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="shrink-0 mt-0.5 w-2 h-2 rounded-full"
                        style={{
                          background: unread ? PRIORITY_COLOR[n.priority] ?? "#5eb8e8" : "transparent",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm truncate">{n.title}</span>
                          {n.isPinned && <Pin size={12} className="shrink-0 opacity-60" />}
                        </div>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--muted)" }}>
                          {n.body}
                        </p>
                        <p className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                          {KIND_LABEL[n.kind] ?? n.kind} · {formatDateTime(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          <Link
            href={inboxHref}
            onClick={() => setOpen(false)}
            className="block text-center text-sm font-semibold py-3 border-t hover:bg-black/5"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
