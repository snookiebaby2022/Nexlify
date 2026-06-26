"use client";

import { useState } from "react";
import { TicketPrioritySelect } from "@/components/ticket-priority-select";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResellerNewTicketPage() {
  const router = useRouter();
  const [form, setForm] = useState({ subject: "", body: "", priority: "NORMAL" });
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/reseller/tickets/${data.ticket.id}`);
    } else {
      alert((await res.json()).error);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/reseller/tickets" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        ← Tickets
      </Link>
      <h1 className="text-2xl font-bold">New support ticket</h1>
      <form
        onSubmit={create}
        className="rounded-xl border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <label className="block text-sm">
          <span className="font-medium">Subject</span>
          <input
            required
            className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Description</span>
          <textarea
            required
            rows={6}
            className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </label>
        <TicketPrioritySelect
          value={form.priority}
          onChange={(priority) => setForm({ ...form, priority })}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full py-3 font-semibold cursor-pointer disabled:opacity-60"
          style={{ background: "#ff4500", color: "#fff" }}
        >
          {loading ? "Submitting…" : "Submit ticket"}
        </button>
      </form>
    </div>
  );
}
