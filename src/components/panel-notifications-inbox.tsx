"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Megaphone, Pin, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { TicketBadge } from "@/components/ticket-ui";
import { TablePager } from "@/components/table-pager";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    const offset = (page - 1) * pageSize;
    fetch(`/api/panel/notifications?limit=${pageSize}&offset=${offset}`)
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications ?? []);
        setTotal(typeof d.total === "number" ? d.total : (d.notifications ?? []).length);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const allSelected =
    notifications.length > 0 && notifications.every((n) => selectedIds.has(n.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(notifications.map((n) => n.id)));
  }

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

  async function dismissIds(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    const res = await fetch("/api/panel/notifications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", ids }),
    });
    setBusy(false);
    if (!res.ok) return;
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (openId && ids.includes(openId)) setOpenId(null);
    window.dispatchEvent(new Event("nexlify-notifications-updated"));
  }

  async function clearAll() {
    if (!total) return;
    if (!confirm(`Clear all ${total} notification(s) from your inbox?`)) return;
    setBusy(true);
    const res = await fetch("/api/panel/notifications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismissAll" }),
    });
    setBusy(false);
    if (!res.ok) return;
    setNotifications([]);
    setSelectedIds(new Set());
    setOpenId(null);
    window.dispatchEvent(new Event("nexlify-notifications-updated"));
  }

  async function markAllRead() {
    setBusy(true);
    await fetch("/api/panel/notifications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "readAll" }),
    });
    setBusy(false);
    load();
    window.dispatchEvent(new Event("nexlify-notifications-updated"));
  }

  const openNotificationRow = notifications.find((n) => n.id === openId);

  if (loading) {
    return (
      <p className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>
        Loading notifications…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <TablePager
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        disabled={loading || busy}
      />
      {notifications.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all
          </label>
          <button
            type="button"
            disabled={busy || !selectedIds.size}
            onClick={() => void dismissIds([...selectedIds])}
            className="text-sm px-3 py-1.5 rounded-lg border disabled:opacity-40"
            style={{ borderColor: "var(--border)" }}
          >
            Delete selected ({selectedIds.size})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void markAllRead()}
            className="text-sm px-3 py-1.5 rounded-lg border"
            style={{ borderColor: "var(--border)" }}
          >
            Mark all read
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void clearAll()}
            className="text-sm px-3 py-1.5 rounded-lg font-medium ml-auto"
            style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
          >
            Clear all
          </button>
        </div>
      )}

      {!notifications.length ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <Bell className="mx-auto mb-3 opacity-40" size={40} />
          <p className="font-medium">No notifications</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Announcements for your account will appear here.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
          <div className="space-y-2">
            {notifications.map((n) => {
              const unread = !n.readAt;
              const active = openId === n.id;
              const checked = selectedIds.has(n.id);
              return (
                <div
                  key={n.id}
                  className="flex gap-2 items-start rounded-xl border p-3 transition-shadow hover:shadow-md"
                  style={{
                    borderColor: active ? "rgba(94,184,232,0.5)" : "var(--border)",
                    background: unread
                      ? "linear-gradient(135deg, rgba(94,184,232,0.1) 0%, var(--bg-card) 100%)"
                      : "var(--bg-card)",
                  }}
                >
                  <input
                    type="checkbox"
                    className="mt-2 shrink-0"
                    checked={checked}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(n.id)) next.delete(n.id);
                        else next.add(n.id);
                        return next;
                      });
                    }}
                    aria-label={`Select ${n.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => openNotification(n.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
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
                  <button
                    type="button"
                    title="Remove from inbox"
                    disabled={busy}
                    onClick={() => void dismissIds([n.id])}
                    className="shrink-0 p-2 rounded-lg hover:bg-white/5 disabled:opacity-40"
                    style={{ color: "var(--muted)" }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <div
            className="rounded-xl border p-6 min-h-[280px]"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            {!openNotificationRow ? (
              <p className="text-sm text-center py-16" style={{ color: "var(--muted)" }}>
                Select a notification to read
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Megaphone size={18} style={{ color: "var(--accent)" }} />
                  <h2 className="text-xl font-bold">{openNotificationRow.title}</h2>
                  {openNotificationRow.isPinned && <Pin size={14} className="opacity-60" />}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <TicketBadge kind="priority" value={openNotificationRow.priority} />
                  <span
                    className="inline-flex rounded-full px-2.5 py-0.5 font-semibold"
                    style={{ background: "rgba(94,184,232,0.15)", color: "#5eb8e8" }}
                  >
                    {KIND_LABEL[openNotificationRow.kind] ?? openNotificationRow.kind}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{openNotificationRow.body}</p>
                <p
                  className="text-xs pt-4 border-t"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  {formatDateTime(openNotificationRow.createdAt)}
                  {openNotificationRow.createdBy?.username ? ` · from ${openNotificationRow.createdBy.username}` : ""}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
