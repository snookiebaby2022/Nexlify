"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TicketReplyForm({
  ticketId,
  closed,
  isAdmin,
}: {
  ticketId: string;
  closed: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (closed) {
    return (
      <p className="text-sm text-[var(--muted)]">This ticket is closed. Open a new ticket if you need more help.</p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await fetch(`/api/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: form.get("body") }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to send");
      return;
    }

    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <textarea
        name="body"
        required
        rows={4}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-violet-500 focus:outline-none resize-y"
        placeholder={isAdmin ? "Staff reply…" : "Your reply…"}
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-full border border-violet-500/50 bg-violet-500/10 px-5 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send reply"}
      </button>
    </form>
  );
}
