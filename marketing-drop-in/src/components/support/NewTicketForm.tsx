"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewTicketForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, priority }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create ticket");
      return;
    }

    router.push(`/support/${data.ticket.id}`);
    router.refresh();
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="font-display text-lg font-semibold text-white">New support ticket</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Describe your issue — licenses, billing, panel setup, or WHMCS.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Subject</label>
          <input
            required
            minLength={3}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white"
            placeholder="License activation issue"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white"
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Message</label>
          <textarea
            required
            minLength={10}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white"
            placeholder="Include your license key, panel URL, and steps to reproduce."
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-violet-600 to-violet-500 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Submitting…" : "Submit ticket"}
        </button>
      </form>
    </div>
  );
}
