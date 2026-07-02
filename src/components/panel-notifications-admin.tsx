"use client";

import { useEffect, useState } from "react";
import { Megaphone, Pin, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { TicketBadge } from "@/components/ticket-ui";
import type { PanelNotificationRow } from "@/lib/panel-notifications";

type ResellerOption = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
};

const KINDS = ["UPDATE", "MESSAGE", "ALERT"] as const;
const PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;

const TARGET_LABEL: Record<string, string> = {
  ALL_RESELLERS: "All resellers",
  SPECIFIC_USER: "Specific user",
};

export function PanelNotificationsAdmin() {
  const [notifications, setNotifications] = useState<PanelNotificationRow[]>([]);
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    kind: "MESSAGE" as (typeof KINDS)[number],
    priority: "NORMAL" as (typeof PRIORITIES)[number],
    target: "ALL_RESELLERS" as "ALL_RESELLERS" | "SPECIFIC_USER",
    recipientId: "",
    isPinned: false,
    expiresAt: "",
  });

  function load() {
    fetch("/api/admin/notifications")
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications ?? []);
        setResellers(d.resellers ?? []);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        recipientId: form.target === "SPECIFIC_USER" ? form.recipientId : null,
        expiresAt: form.expiresAt || null,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setForm({
        title: "",
        body: "",
        kind: "MESSAGE",
        priority: "NORMAL",
        target: "ALL_RESELLERS",
        recipientId: "",
        isPinned: false,
        expiresAt: "",
      });
      load();
    } else {
      const d = await res.json();
      alert(d.error ?? "Failed to send");
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/admin/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this notification?")) return;
    await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={create}
        className="rounded-xl border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Megaphone size={20} style={{ color: "var(--accent)" }} />
          Compose announcement
        </h2>

        <label className="block text-sm">
          <span className="font-medium">Title</span>
          <input
            required
            className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Message</span>
          <textarea
            required
            rows={4}
            className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent resize-y"
            style={{ borderColor: "var(--border)" }}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </label>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block text-sm">
            <span className="font-medium">Kind</span>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.charAt(0) + k.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium">Priority</span>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as typeof form.priority })
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium">Target</span>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.target}
              onChange={(e) =>
                setForm({
                  ...form,
                  target: e.target.value as typeof form.target,
                  recipientId: "",
                })
              }
            >
              <option value="ALL_RESELLERS">All resellers</option>
              <option value="SPECIFIC_USER">Specific reseller</option>
            </select>
          </label>

          {form.target === "SPECIFIC_USER" && (
            <label className="block text-sm">
              <span className="font-medium">Recipient</span>
              <select
                required
                className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={form.recipientId}
                onChange={(e) => setForm({ ...form, recipientId: e.target.value })}
              >
                <option value="">Select reseller…</option>
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.username}
                    {r.displayName ? ` (${r.displayName})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <label className="block text-sm">
            <span className="font-medium">Expires (optional)</span>
            <input
              type="datetime-local"
              className="mt-1 rounded-lg border px-3 py-2.5 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2.5">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(e) => setForm({ ...form, isPinned: e.target.checked })}
            />
            <Pin size={14} />
            Pin to top
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="text-sm px-5 py-2.5 rounded-full font-semibold disabled:opacity-50"
          style={{ background: "#ff4500", color: "#fff" }}
        >
          {loading ? "Sending…" : "Send notification"}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="text-lg font-bold">Sent notifications</h2>
        {notifications.length === 0 ? (
          <div
            className="rounded-xl border p-10 text-center"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <Megaphone className="mx-auto mb-3 opacity-40" size={36} />
            <p style={{ color: "var(--muted)" }}>No announcements sent yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <article
              key={n.id}
              className="rounded-xl border p-4 flex flex-wrap gap-4 items-start"
              style={{
                borderColor: "var(--border)",
                background: n.isActive
                  ? "linear-gradient(135deg, var(--bg-card) 0%, rgba(94,184,232,0.04) 100%)"
                  : "var(--bg-card)",
                opacity: n.isActive ? 1 : 0.65,
              }}
            >
              <div className="flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{n.title}</h3>
                  {n.isPinned && <Pin size={14} className="opacity-60" />}
                  <TicketBadge kind="priority" value={n.priority} />
                  {!n.isActive && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: "var(--muted)" }}>
                  {n.body}
                </p>
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  {TARGET_LABEL[n.target] ?? n.target}
                  {n.recipient?.username ? ` → ${n.recipient.username}` : ""}
                  {" · "}
                  {formatDateTime(n.createdAt)}
                  {typeof n.readCount === "number" ? ` · ${n.readCount} read` : ""}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleActive(n.id, n.isActive)}
                  className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                >
                  {n.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer flex items-center gap-1"
                  style={{ borderColor: "rgba(239,68,68,0.4)", color: "#f87171" }}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
