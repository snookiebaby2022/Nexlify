"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { TicketBadge } from "@/components/ticket-ui";
import { TicketPrioritySelect } from "@/components/ticket-priority-select";

type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { username: string; displayName: string | null; role: string };
  assignedTo: { username: string } | null;
  messages: {
    id: string;
    body: string;
    createdAt: string;
    author: { username: string; displayName: string | null; role: string };
  }[];
};

export function TicketDetailView({
  ticketId,
  listHref,
  isAdmin,
}: {
  ticketId: string;
  listHref: string;
  isAdmin: boolean;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/tickets/${ticketId}`)
      .then((r) => r.json())
      .then((d) => setTicket(d.ticket));
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    const res = await fetch(`/api/admin/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    if (res.ok) {
      setReply("");
      load();
    } else {
      setMsg((await res.json()).error ?? "Failed to send");
    }
  }

  async function patchTicket(patch: Record<string, string>) {
    if (!isAdmin) return;
    await fetch(`/api/admin/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  if (!ticket) {
    return <p style={{ color: "var(--muted)" }}>Loading ticket…</p>;
  }

  const thread = [
    {
      id: "initial",
      body: ticket.body,
      createdAt: ticket.createdAt,
      author: ticket.createdBy,
    },
    ...ticket.messages,
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href={listHref} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        ← All tickets
      </Link>

      <header
        className="rounded-xl border p-5 space-y-3"
        style={{
          borderColor: "var(--border)",
          background: "linear-gradient(135deg, var(--bg-card) 0%, rgba(94,184,232,0.08) 100%)",
        }}
      >
        <h1 className="text-xl font-bold">{ticket.subject}</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <TicketBadge kind="status" value={ticket.status} />
          <TicketBadge kind="priority" value={ticket.priority} />
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Opened {formatDateTime(ticket.createdAt)} by {ticket.createdBy.displayName || ticket.createdBy.username}
          </span>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-4 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <label className="text-xs">
              <span style={{ color: "var(--muted)" }}>Status</span>
              <select
                className="block mt-1 rounded border px-2 py-1 text-sm bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={ticket.status}
                onChange={(e) => patchTicket({ status: e.target.value })}
              >
                {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex-1 min-w-[200px]">
              <TicketPrioritySelect
                value={ticket.priority}
                onChange={(priority) => patchTicket({ priority })}
              />
            </div>
          </div>
        )}
      </header>

      <div className="space-y-3">
        {thread.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="flex justify-between gap-2 text-xs mb-2" style={{ color: "var(--muted)" }}>
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {m.author.displayName || m.author.username}
                <span className="font-normal opacity-70"> · {m.author.role}</span>
              </span>
              <span>{formatDateTime(m.createdAt)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>

      <form
        onSubmit={sendReply}
        className="rounded-xl border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium text-sm">Reply</h2>
        <textarea
          rows={4}
          required
          className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          placeholder="Write your message…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        {msg && <p className="text-sm" style={{ color: "var(--danger)" }}>{msg}</p>}
        <button
          type="submit"
          className="rounded-full px-5 py-2 text-sm font-semibold cursor-pointer"
          style={{ background: "#ff4500", color: "#fff" }}
        >
          Send reply
        </button>
      </form>
    </div>
  );
}
