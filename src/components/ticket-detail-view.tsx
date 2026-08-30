"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { TicketBadge } from "@/components/ticket-ui";
import { TicketPrioritySelect } from "@/components/ticket-priority-select";
import { ticketsApiRoot } from "@/lib/panel-api";

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
  const [fixQuery, setFixQuery] = useState("");
  const [fixHits, setFixHits] = useState<{ id: string; name: string }[]>([]);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixMsg, setFixMsg] = useState("");

  const ticketsApi = ticketsApiRoot(isAdmin);

  const load = useCallback(() => {
    fetch(`${ticketsApi}/${ticketId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.ticket) setTicket(d.ticket); })
      .catch(() => setMsg("Failed to load ticket"));
  }, [ticketId, ticketsApi]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    try {
      const res = await fetch(`${ticketsApi}/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      if (res.ok) {
        setReply("");
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error ?? "Failed to send");
      }
    } catch {
      setMsg("Network error — could not send reply");
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
        {isAdmin ? (
          <div className="pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-medium">Fix this channel</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Restart / re-probe the stream the viewer reported.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded border px-2 py-1 text-sm bg-transparent flex-1 min-w-[12rem]"
                style={{ borderColor: "var(--border)" }}
                placeholder="Search channel name…"
                value={fixQuery}
                onChange={(e) => setFixQuery(e.target.value)}
              />
              <button
                type="button"
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => {
                  const q = fixQuery.trim();
                  if (!q) return;
                  fetch(`/api/admin/streams?search=${encodeURIComponent(q)}&pageSize=8&type=LIVE&skipTotal=1`)
                    .then((r) => r.json())
                    .then((d) => setFixHits(Array.isArray(d.streams) ? d.streams.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })) : []))
                    .catch(() => setFixHits([]));
                }}
              >
                Find
              </button>
            </div>
            {fixHits.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{s.name}</span>
                <button
                  type="button"
                  disabled={fixBusy}
                  className="shrink-0 text-xs underline"
                  style={{ color: "var(--accent)" }}
                  onClick={async () => {
                    setFixBusy(true);
                    setFixMsg("");
                    const res = await fetch("/api/admin/stream-health", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ streamId: s.id }),
                    });
                    const j = await res.json().catch(() => ({}));
                    setFixBusy(false);
                    setFixMsg(j.message ?? j.error ?? (res.ok ? "Restart queued" : "Fix failed"));
                  }}
                >
                  Fix this channel
                </button>
              </div>
            ))}
            {fixMsg ? <p className="text-xs" style={{ color: "var(--muted)" }}>{fixMsg}</p> : null}
          </div>
        ) : null}
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
