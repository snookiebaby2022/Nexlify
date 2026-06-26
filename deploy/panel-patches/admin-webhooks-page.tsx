"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";

type Webhook = {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  label?: string;
};

export default function AdminWebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [form, setForm] = useState({
    url: "",
    label: "",
    secret: "",
    events: ["line.created"] as string[],
  });

  function load() {
    fetch("/api/admin/webhooks")
      .then((r) => r.json())
      .then((d) => {
        setWebhooks(d.webhooks ?? []);
        setEvents(d.events ?? []);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ url: "", label: "", secret: "", events: ["line.created"] });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/webhooks?id=${id}`, { method: "DELETE" });
    load();
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev],
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Outbound webhooks</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          POST JSON to your URL when lines are created, updated, or banned. Signed with{" "}
          <code>X-Nexlify-Signature</code> when a secret is set.
        </p>
      </div>

      <form
        onSubmit={save}
        className="rounded-xl border p-4 space-y-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            required
            placeholder="Webhook URL"
            className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
            style={{ borderColor: "var(--border)" }}
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
          <input
            placeholder="Label (optional)"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <input
            placeholder="Signing secret (optional)"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {events.map((ev) => (
            <label key={ev} className="text-xs flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={form.events.includes(ev)}
                onChange={() => toggleEvent(ev)}
              />
              {ev}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add webhook
        </button>
      </form>

      <DataTable
        headers={["Label", "URL", "Events", "Active", ""]}
        rows={webhooks.map((w) => [
          w.label ?? "—",
          <code key={w.id} className="text-xs break-all">
            {w.url}
          </code>,
          w.events.join(", "),
          w.isActive ? "Yes" : "No",
          <button
            key={`d-${w.id}`}
            type="button"
            onClick={() => remove(w.id)}
            className="text-xs cursor-pointer"
            style={{ color: "var(--danger)" }}
          >
            Delete
          </button>,
        ])}
      />
    </div>
  );
}
