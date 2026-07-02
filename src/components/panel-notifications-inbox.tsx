"use client";

import { useEffect, useState } from "react";
import { Bell, Megaphone, Pin } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { TicketBadge } from "@/components/ticket-ui";
import type { PanelNotificationRow } from "@/lib/panel-notifications";

const KIND_LABEL: Record<string, string> = {
  UPDATE: "Update",
  MESSAGE: "Message",
  ALERT: "Alert",
};

export function PanelNotificationsInbox() {
  const [notifications, setNotifications] = useState<PanelNotificationRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/panel/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function openNotification(id: string) {
    setOpenId(id);
    const n = notifications.find((x) => x.id === id);
    if (n && !n.readAt) {
      const res = await fetch(`/api/panel/notifications/${id}/read`, { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, readAt: d.readAt } : item
          )
        );
        window.dispatchEvent(new Event("nexlify-notifications-updated"));
      }
    }
  }

  const selected = notifications.find((n) => n.id === openId);

  if (loading) {
    return (
      <p className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>
        Loading notifications…
      </p>
    );
  }

  if (!notifications.length) {
    return (
      <div
        className="rounded-xl border p-12 text-center"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <Bell className="mx-auto mb-3 opacity-40" size={40} />
        <p className="font-medium">No notifications</p>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Announcements from your panel admin will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
      <div className="space-y-2">
        {notifications.map((n) => {
          const unread = !n.readAt;
          const active = openId === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => openNotification(n.id)}
              className="w-full text-left rounded-xl border p-4 cursor-pointer transition-shadow hover:shadow-md"
              style={{
                borderColor: active ? "rgba(94,184,232,0.5)" : "var(--border)",
                background: unread
                  ? "linear-gradient(135deg, rgba(94,184,232,0.1) 0%, var(--bg-card) 100%)"
                  : "var(--bg-card)",
              }}
            >
              <div className="flex items-start gap-2">
                {unread && (
                  <span
                    className="shrink-0 mt-1.5 w-2 h-2 rounded-full"
                    style={{ background: "#5eb8e8" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{n.title}</span>
                    {n.isPinned && <Pin size={12} className="opacity-60" />}
                    <TicketBadge kind="priority" value={n.priority} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    {KIND_LABEL[n.kind] ?? n.kind} · {formatDateTime(n.createdAt)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="rounded-xl border p-6 min-h-[280px]"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        {!selected ? (
          <p className="text-sm text-center py-16" style={{ color: "var(--muted)" }}>
            Select a notification to read
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Megaphone size={18} style={{ color: "var(--accent)" }} />
              <h2 className="text-xl font-bold">{selected.title}</h2>
              {selected.isPinned && <Pin size={14} className="opacity-60" />}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <TicketBadge kind="priority" value={selected.priority} />
              <span
                className="inline-flex rounded-full px-2.5 py-0.5 font-semibold"
                style={{ background: "rgba(94,184,232,0.15)", color: "#5eb8e8" }}
              >
                {KIND_LABEL[selected.kind] ?? selected.kind}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{selected.body}</p>
            <p className="text-xs pt-4 border-t" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              {formatDateTime(selected.createdAt)}
              {selected.createdBy?.username ? ` · from ${selected.createdBy.username}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
