"use client";

import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { LifeBuoy, MessageSquare } from "lucide-react";

export const TICKET_STATUS: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  OPEN: { label: "Open", bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  IN_PROGRESS: { label: "In progress", bg: "rgba(245,158,11,0.18)", color: "#fbbf24" },
  RESOLVED: { label: "Resolved", bg: "rgba(16,185,129,0.15)", color: "#34d399" },
  CLOSED: { label: "Closed", bg: "rgba(100,116,139,0.2)", color: "#94a3b8" },
};

export const TICKET_PRIORITY: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  LOW: { label: "Low", bg: "rgba(148,163,184,0.2)", color: "#94a3b8" },
  NORMAL: { label: "Normal", bg: "rgba(94,184,232,0.15)", color: "#5eb8e8" },
  HIGH: { label: "High", bg: "rgba(249,115,22,0.18)", color: "#fb923c" },
  URGENT: { label: "Urgent", bg: "rgba(239,68,68,0.2)", color: "#f87171" },
};

export const TICKET_CATEGORY: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  SUPPORT: { label: "Support", bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
  SUGGESTION: { label: "Suggestion", bg: "rgba(168,85,247,0.15)", color: "#a78bfa" },
  REPORT: { label: "Report", bg: "rgba(245,158,11,0.18)", color: "#fbbf24" },
  BUG: { label: "Bug", bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  BILLING: { label: "Billing", bg: "rgba(16,185,129,0.15)", color: "#34d399" },
  GENERAL: { label: "General", bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
};

export function TicketBadge({
  kind,
  value,
}: {
  kind: "status" | "priority" | "category";
  value: string;
}) {
  const map = kind === "status" ? TICKET_STATUS : kind === "priority" ? TICKET_PRIORITY : TICKET_CATEGORY;
  const s = map[value] ?? { label: value, bg: "var(--bg-card)", color: "var(--muted)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

export type TicketRow = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: { username: string };
  assignedTo?: { id: string; username: string } | null;
  assignedToId?: string | null;
  category?: string;
};

export function TicketsList({
  tickets,
  detailBase,
  isAdmin,
  onStatusChange,
}: {
  tickets: TicketRow[];
  detailBase: string;
  isAdmin?: boolean;
  onStatusChange?: (id: string, status: string) => void;
}) {
  if (!tickets.length) {
    return (
      <div
        className="rounded-xl border p-12 text-center"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <LifeBuoy className="mx-auto mb-3 opacity-40" size={40} />
        <p className="font-medium">No tickets yet</p>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Create one when you need help from support.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {tickets.map((t) => (
        <article
          key={t.id}
          className="rounded-xl border p-4 flex flex-wrap items-start gap-4 transition-shadow hover:shadow-md"
          style={{
            borderColor: "var(--border)",
            background: "linear-gradient(135deg, var(--bg-card) 0%, rgba(94,184,232,0.04) 100%)",
          }}
        >
          <div className="flex-1 min-w-[200px]">
            <Link
              href={`${detailBase}/${t.id}`}
              className="font-semibold text-base hover:underline flex items-center gap-2"
              style={{ color: "var(--accent)" }}
            >
              <MessageSquare size={16} className="shrink-0 opacity-70" />
              {t.subject}
            </Link>
            <p className="text-xs mt-2 flex flex-wrap gap-2" style={{ color: "var(--muted)" }}>
              {t.createdBy && <span>By @{t.createdBy.username}</span>}
              {t.assignedTo && <span>→ {t.assignedTo.username}</span>}
              <span>{formatDateTime(t.updatedAt ?? t.createdAt)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TicketBadge kind="category" value={t.category ?? "GENERAL"} />
            <TicketBadge kind="priority" value={t.priority} />
            {isAdmin && onStatusChange ? (
              <select
                className="rounded-lg border px-2 py-1 text-xs bg-transparent font-medium"
                style={{ borderColor: "var(--border)" }}
                value={t.status}
                onChange={(e) => onStatusChange(t.id, e.target.value)}
              >
                {Object.keys(TICKET_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS[s].label}
                  </option>
                ))}
              </select>
            ) : (
              <TicketBadge kind="status" value={t.status} />
            )}
            <Link
              href={`${detailBase}/${t.id}`}
              className="text-xs font-medium px-3 py-1.5 rounded-full border"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              View
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
