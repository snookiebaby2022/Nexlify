"use client";

import { useMemo, useState } from "react";
import { TicketPrioritySelect } from "@/components/ticket-priority-select";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  TICKET_CONTENT_TYPES,
  buildTicketSubject,
  type TicketContentTypeId,
  type TicketIntent,
} from "@/lib/ticket-content-types";

export default function ResellerNewTicketPage() {
  const router = useRouter();
  const [contentTypeId, setContentTypeId] = useState<TicketContentTypeId>("report_channels");
  const [intent, setIntent] = useState<TicketIntent>("report");
  const [form, setForm] = useState({ title: "", body: "", priority: "NORMAL" });
  const [loading, setLoading] = useState(false);

  const contentType = useMemo(
    () => TICKET_CONTENT_TYPES.find((t) => t.id === contentTypeId) ?? TICKET_CONTENT_TYPES[0]!,
    [contentTypeId]
  );

  const effectiveIntent: TicketIntent = contentType.fixedIntent ?? intent;

  function onContentTypeChange(id: TicketContentTypeId) {
    setContentTypeId(id);
    const next = TICKET_CONTENT_TYPES.find((t) => t.id === id);
    if (next?.fixedIntent) setIntent(next.fixedIntent);
    else if (!intent) setIntent("report");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      alert("Please enter a title / channel or title name.");
      return;
    }
    setLoading(true);
    const subject = buildTicketSubject(effectiveIntent, contentType.content, title);
    const category = contentType.categoryForIntent[effectiveIntent];
    const res = await fetch("/api/reseller/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body: form.body,
        priority: form.priority,
        category,
      }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/reseller/tickets/${data.ticket.id}`);
    } else {
      alert((await res.json()).error);
    }
  }

  const titleHint =
    contentType.content === "channels"
      ? effectiveIntent === "report"
        ? "Channel name that is broken / missing"
        : "Channel name you want added"
      : contentType.content === "movies"
        ? effectiveIntent === "report"
          ? "Movie title that is broken / missing"
          : "Movie title you want added"
        : effectiveIntent === "report"
          ? "Series / episode that is broken / missing"
          : "Series / episode you want added";

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/reseller/tickets" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        ← Tickets
      </Link>
      <h1 className="text-2xl font-bold">New support ticket</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Choose a type so it appears on the admin dashboard under User Reported Channels or New Channels
        Add Request (including Movies and TV Series).
      </p>
      <form
        onSubmit={create}
        className="rounded-xl border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <fieldset>
          <legend className="text-sm font-medium mb-2">Ticket type</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TICKET_CONTENT_TYPES.map((t) => {
              const selected = contentTypeId === t.id;
              return (
                <label
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer"
                  style={{
                    borderColor: selected ? "var(--accent)" : "var(--border)",
                    background: selected ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="contentType"
                    checked={selected}
                    onChange={() => onContentTypeChange(t.id)}
                  />
                  <span className="font-medium">{t.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {contentType.fixedIntent == null && (
          <fieldset>
            <legend className="text-sm font-medium mb-2">What do you need?</legend>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="intent"
                  checked={intent === "report"}
                  onChange={() => setIntent("report")}
                />
                Report a problem
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="intent"
                  checked={intent === "request"}
                  onChange={() => setIntent("request")}
                />
                Request new content
              </label>
            </div>
          </fieldset>
        )}

        <label className="block text-sm">
          <span className="font-medium">Title</span>
          <input
            required
            className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            placeholder={titleHint}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
            Saved as: {buildTicketSubject(effectiveIntent, contentType.content, form.title || "…")}
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Description</span>
          <textarea
            required
            rows={6}
            className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            placeholder="Details, app name, screenshot notes…"
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
