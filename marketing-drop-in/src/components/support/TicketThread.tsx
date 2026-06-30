"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Message = {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  authorEmail: string;
  authorName: string | null;
};

export function TicketThread({
  ticketId,
  status,
  messages,
  isAdmin,
}: {
  ticketId: string;
  status: string;
  messages: Message[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = status === "CLOSED";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = isAdmin ? "/api/admin/tickets" : "/api/support/tickets";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isAdmin ? { ticketId, body } : { ticketId, body, reply: true }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Reply failed");
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-2xl p-4 ${
            m.isStaff ? "border border-violet-500/30 bg-violet-500/10" : "glass"
          }`}
        >
          <p className="text-xs text-[var(--muted)]">
            {m.isStaff ? "Nexlify support" : m.authorName ?? m.authorEmail} ·{" "}
            {new Date(m.createdAt).toLocaleString()}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{m.body}</p>
        </div>
      ))}

      {!closed && (
        <form onSubmit={onSubmit} className="glass rounded-2xl p-5 space-y-3">
          <label className="block text-sm text-slate-400">Reply</label>
          <textarea
            required
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send reply"}
          </button>
        </form>
      )}
    </div>
  );
}
