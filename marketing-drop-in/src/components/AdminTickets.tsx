"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CANNED_REPLIES } from "@/lib/admin-canned-replies";
import { formatDate } from "@/lib/format";
import {
  formatTicketRef,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  ticketStatusColor,
} from "@/lib/tickets";

type TicketRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  email: string;
  name: string | null;
  messageCount: number;
  updatedAt: string;
  messages: {
    id: string;
    body: string;
    isStaff: boolean;
    createdAt: string;
    authorEmail: string;
  }[];
};

export function AdminTickets() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    if (priorityFilter) p.set("priority", priorityFilter);
    if (openOnly) p.set("open", "1");
    fetch(`/api/admin/tickets?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setTickets(d.tickets ?? []);
        setOpenCount(d.openCount ?? 0);
      })
      .finally(() => setLoading(false));
  }, [statusFilter, priorityFilter, openOnly]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function sendReply(ticketId: string) {
    if (!replyBody.trim()) return;
    const res = await fetch("/api/admin/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, body: replyBody.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Reply failed");
      return;
    }
    setReplyId(null);
    setReplyBody("");
    load();
  }

  async function updateTicket(id: string, patch: Record<string, string>) {
    await fetch("/api/admin/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">Support tickets</h2>
          <p className="text-sm text-[var(--muted)]">{openCount} open</p>
        </div>
        <Link
          href="/admin/tickets"
          className="text-sm text-violet-400 hover:underline"
        >
          Full ticket page →
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="rounded border-slate-600"
          />
          Open only
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
        >
          <option value="">All statuses</option>
          {Object.entries(TICKET_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
        >
          <option value="">All priorities</option>
          {Object.entries(TICKET_PRIORITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading tickets…</p>
      ) : tickets.length === 0 ? (
        <p className="text-slate-500 text-sm">No tickets match filters.</p>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <article
              key={t.id}
              className="glass rounded-2xl p-5 border border-slate-800/80"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-violet-300">
                      {formatTicketRef(t.id)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${ticketStatusColor(t.status as keyof typeof TICKET_STATUS_LABEL)}`}
                    >
                      {TICKET_STATUS_LABEL[t.status as keyof typeof TICKET_STATUS_LABEL]}
                    </span>
                    <span className="text-xs text-amber-400/90">
                      {TICKET_PRIORITY_LABEL[t.priority as keyof typeof TICKET_PRIORITY_LABEL]}
                    </span>
                  </div>
                  <p className="mt-2 font-medium text-white">{t.subject}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {t.name ? `${t.name} · ` : ""}
                    {t.email} · {t.messageCount} msgs · {formatDate(t.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/support/${t.id}`}
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    Open
                  </Link>
                  {t.status !== "CLOSED" && (
                    <button
                      type="button"
                      onClick={() => updateTicket(t.id, { status: "CLOSED" })}
                      className="text-xs text-slate-400 hover:underline"
                    >
                      Close
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(expanded === t.id ? null : t.id);
                      setReplyId(t.id);
                    }}
                    className="text-xs text-violet-400 hover:underline"
                  >
                    Reply
                  </button>
                </div>
              </div>

              {expanded === t.id && (
                <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                  {t.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.isStaff ? "bg-violet-500/10 text-violet-100" : "bg-slate-800/50 text-slate-200"
                      }`}
                    >
                      <p className="text-[10px] text-slate-500 mb-1">
                        {m.authorEmail} · {formatDate(m.createdAt)}
                        {m.isStaff ? " · staff" : ""}
                      </p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}

                  {replyId === t.id && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {CANNED_REPLIES.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setReplyBody(c.body)}
                            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-violet-500/40"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={4}
                        placeholder="Staff reply…"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <button
                        type="button"
                        onClick={() => sendReply(t.id)}
                        className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white"
                      >
                        Send reply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
