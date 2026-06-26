"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Clock,
  Link2,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Ticket,
  TriangleAlert,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { TicketBadge } from "@/components/ticket-ui";
import type { PanelNotificationRow } from "@/lib/panel-notifications";

type TicketRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt?: string;
};

type Tab = "messages" | "tickets";

const KIND_STYLE: Record<
  string,
  { emoji: string; icon: typeof Megaphone; color: string; bg: string }
> = {
  UPDATE: { emoji: "📢", icon: Megaphone, color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  MESSAGE: { emoji: "💬", icon: MessageSquare, color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  ALERT: { emoji: "⚠️", icon: TriangleAlert, color: "#eab308", bg: "rgba(234,179,8,0.14)" },
};

function RichBody({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        return (
          <div key={bi} className="space-y-1">
            {lines.map((line, li) => {
              const parts = line.split(/(\*\*[^*]+\*\*)/g);
              return (
                <p
                  key={li}
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--text)" }}
                >
                  {parts.map((part, pi) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                      <strong key={pi} className="font-semibold text-white">
                        {part.slice(2, -2)}
                      </strong>
                    ) : (
                      <span key={pi}>{part}</span>
                    )
                  )}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function kindMeta(kind: string) {
  return KIND_STYLE[kind] ?? KIND_STYLE.MESSAGE;
}

export function ResellerNotificationsWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("messages");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<PanelNotificationRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [messageUnread, setMessageUnread] = useState(0);

  const activeTickets = tickets.filter((t) =>
    ["OPEN", "IN_PROGRESS"].includes(t.status)
  );
  const totalBadge = messageUnread + activeTickets.length;

  const loadMessages = useCallback(async () => {
    const [inboxRes, unreadRes] = await Promise.all([
      fetch("/api/panel/notifications?limit=20"),
      fetch("/api/panel/notifications/unread"),
    ]);
    if (inboxRes.ok) {
      const d = await inboxRes.json();
      setMessages(d.notifications ?? []);
    }
    if (unreadRes.ok) {
      const d = await unreadRes.json();
      setMessageUnread(d.count ?? 0);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    const res = await fetch("/api/admin/tickets");
    if (!res.ok) return;
    const d = await res.json();
    setTickets(d.tickets ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadMessages(), loadTickets()]);
    } finally {
      setLoading(false);
    }
  }, [loadMessages, loadTickets]);

  useEffect(() => {
    loadMessages();
    loadTickets();
    const t = setInterval(() => {
      loadMessages();
      loadTickets();
    }, 60000);
    const onUpdate = () => loadMessages();
    window.addEventListener("nexlify-notifications-updated", onUpdate);
    return () => {
      clearInterval(t);
      window.removeEventListener("nexlify-notifications-updated", onUpdate);
    };
  }, [loadMessages, loadTickets]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function markRead(id: string) {
    const res = await fetch(`/api/panel/notifications/${id}/read`, { method: "POST" });
    if (res.ok) {
      setMessages((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      setMessageUnread((c) => Math.max(0, c - 1));
      window.dispatchEvent(new Event("nexlify-notifications-updated"));
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-[300] flex flex-col items-start gap-3">
      {open && (
        <div
          className="w-[min(92vw,400px)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{
            background: "linear-gradient(165deg, #1e293b 0%, #0f172a 55%, #111827 100%)",
            border: "1px solid rgba(94,184,232,0.25)",
            maxHeight: "min(72vh, 480px)",
          }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between shrink-0"
            style={{
              background: "linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)",
            }}
          >
            <h2 className="font-bold text-white text-base tracking-tight">Notifications</h2>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh"
              aria-label="Refresh notifications"
            >
              <RefreshCw
                size={18}
                className={`text-white ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          <div
            className="flex shrink-0 border-b"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.6)" }}
          >
            {(
              [
                { id: "messages" as Tab, label: "Messages", count: messageUnread },
                { id: "tickets" as Tab, label: "Tickets", count: activeTickets.length },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className="flex-1 py-2.5 text-sm font-semibold cursor-pointer transition-colors relative"
                  style={{ color: active ? "#fff" : "#94a3b8" }}
                >
                  <span className="inline-flex items-center gap-2 justify-center">
                    {item.label}
                    {item.count > 0 && (
                      <span
                        className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}
                      >
                        {item.count > 99 ? "99+" : item.count}
                      </span>
                    )}
                  </span>
                  {active && (
                    <span
                      className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                      style={{ background: "linear-gradient(90deg, #38bdf8, #818cf8)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2.5">
            {tab === "messages" && (
              <>
                {loading && messages.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: "#94a3b8" }}>
                    Loading…
                  </p>
                )}
                {!loading && messages.length === 0 && (
                  <div
                    className="rounded-xl p-6 text-center"
                    style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
                  >
                    <Megaphone className="mx-auto mb-2 text-sky-400" size={28} />
                    <p className="font-medium text-white">No messages yet</p>
                    <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                      Panel announcements will appear here.
                    </p>
                  </div>
                )}
                {messages.map((n) => {
                  const meta = kindMeta(n.kind);
                  const unread = !n.readAt;
                  const Icon = meta.icon;
                  return (
                    <article
                      key={n.id}
                      className="rounded-xl p-3 transition-shadow"
                      style={{
                        background: unread
                          ? "linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(124,58,237,0.1) 100%)"
                          : "rgba(30,41,59,0.85)",
                        border: `1px solid ${unread ? "rgba(96,165,250,0.35)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <div className="flex gap-3">
                        <div
                          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                          style={{ background: meta.bg }}
                        >
                          <span className="sr-only">{n.kind}</span>
                          <Icon size={20} style={{ color: meta.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-white leading-snug">
                              <span className="mr-1.5" aria-hidden>
                                {meta.emoji}
                              </span>
                              {n.title}
                            </h3>
                            {unread && (
                              <button
                                type="button"
                                onClick={() => void markRead(n.id)}
                                className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer"
                                style={{
                                  background: "rgba(34,197,94,0.2)",
                                  color: "#4ade80",
                                }}
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                          {n.target === "ALL_RESELLERS" && (
                            <p className="text-[11px] mt-0.5 font-medium" style={{ color: "#a78bfa" }}>
                              Announcement for All Resellers
                            </p>
                          )}
                          <div className="mt-2">
                            <RichBody text={n.body} />
                          </div>
                          <p className="text-[10px] mt-2" style={{ color: "#64748b" }}>
                            {formatDateTime(n.createdAt)}
                            {n.createdBy?.username ? ` · @${n.createdBy.username}` : ""}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}

                <div
                  className="rounded-xl p-3 space-y-3"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(248,113,113,0.25)",
                  }}
                >
                  <div className="flex gap-3">
                    <div
                      className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(239,68,68,0.15)" }}
                    >
                      <Ticket size={20} style={{ color: "#f87171" }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">
                        <span className="mr-1">🎫</span>
                        Ticket System — Mandatory
                      </h3>
                      <RichBody text="For all requests (Live TV / TV Shows / Movies), you **must** use the ticket system." />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div
                      className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(249,115,22,0.15)" }}
                    >
                      <Clock size={20} style={{ color: "#fb923c" }} />
                    </div>
                    <div>
                      <RichBody text="You will receive an update on your ticket within **24 hours**." />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div
                      className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(148,163,184,0.15)" }}
                    >
                      <Link2 size={20} style={{ color: "#94a3b8" }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white mb-1">
                        Request Requirements (Links & Strikes)
                      </h3>
                      <RichBody text="All **movie and series** requests must include a **valid IMDb or TMDB URL** in the ticket. Example: https://www.imdb.com/title/tt1234567/ or https://www.themoviedb.org/movie/12345" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === "tickets" && (
              <>
                {loading && tickets.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: "#94a3b8" }}>
                    Loading…
                  </p>
                )}
                {!loading && tickets.length === 0 && (
                  <div
                    className="rounded-xl p-6 text-center"
                    style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(52,211,153,0.25)" }}
                  >
                    <Ticket className="mx-auto mb-2 text-emerald-400" size={28} />
                    <p className="font-medium text-white">No tickets yet</p>
                    <Link
                      href="/reseller/tickets/new"
                      className="inline-block mt-3 text-sm font-semibold"
                      style={{ color: "#34d399" }}
                      onClick={() => setOpen(false)}
                    >
                      Create a ticket →
                    </Link>
                  </div>
                )}
                {tickets.slice(0, 12).map((t) => (
                  <Link
                    key={t.id}
                    href={`/reseller/tickets/${t.id}`}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl p-3 transition-transform hover:scale-[1.01]"
                    style={{
                      background: "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.08) 100%)",
                      border: "1px solid rgba(52,211,153,0.2)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
                          <Ticket size={14} className="shrink-0 text-emerald-400" />
                          {t.subject}
                        </p>
                        <p className="text-[10px] mt-1" style={{ color: "#64748b" }}>
                          {formatDateTime(t.updatedAt ?? t.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <TicketBadge kind="status" value={t.status} />
                        <TicketBadge kind="priority" value={t.priority} />
                      </div>
                    </div>
                  </Link>
                ))}
                {tickets.length > 0 && (
                  <Link
                    href="/reseller/tickets"
                    onClick={() => setOpen(false)}
                    className="block text-center text-sm font-semibold py-2 rounded-lg"
                    style={{ color: "#38bdf8" }}
                  >
                    View all tickets →
                  </Link>
                )}
              </>
            )}
          </div>

          <div
            className="shrink-0 px-3 py-2 border-t flex items-center justify-between text-[11px]"
            style={{ borderColor: "rgba(255,255,255,0.06)", color: "#64748b" }}
          >
            <Link
              href="/reseller/notifications"
              onClick={() => setOpen(false)}
              className="font-medium hover:underline"
              style={{ color: "#818cf8" }}
            >
              Full inbox
            </Link>
            <span className="flex items-center gap-1">
              <TriangleAlert size={12} style={{ color: "#eab308" }} />
              Check regularly for updates
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #22c55e 0%, #16a34a 55%, #15803d 100%)",
          boxShadow: "0 8px 24px rgba(34,197,94,0.45)",
        }}
        title="Notifications"
        aria-expanded={open}
        aria-label={`Notifications${totalBadge ? `, ${totalBadge} items` : ""}`}
      >
        <Bell size={26} className="text-white" strokeWidth={2.25} />
        {totalBadge > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
          >
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>
    </div>
  );
}
