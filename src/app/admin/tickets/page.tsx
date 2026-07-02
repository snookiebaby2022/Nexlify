"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TicketsList, type TicketRow } from "@/components/ticket-ui";
import { LifeBuoy, Filter, User, Tag } from "lucide-react";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterAssignee, setFilterAssignee] = useState("ALL");
  const [admins, setAdmins] = useState<{ id: string; username: string }[]>([]);

  function load() {
    fetch("/api/admin/tickets")
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets ?? []));
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) => setAdmins((d.users ?? []).filter((u: any) => u.role === "ADMIN")));
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: string) {
    await fetch("/api/admin/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  async function setAssignee(id: string, assignedToId: string | null) {
    await fetch("/api/admin/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, assignedToId: assignedToId || null }),
    });
    load();
  }

  const filtered = tickets.filter((t) => {
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (filterCategory !== "ALL" && t.category !== filterCategory) return false;
    if (filterAssignee !== "ALL" && t.assignedToId !== filterAssignee) return false;
    return true;
  });

  const categories = ["SUPPORT", "SUGGESTION", "REPORT", "BUG", "BILLING", "GENERAL"];

  const categoryLabel = (c: string) => {
    const map: Record<string, string> = {
      SUPPORT: "Support",
      SUGGESTION: "Suggestion",
      REPORT: "Report",
      BUG: "Bug",
      BILLING: "Billing",
      GENERAL: "General",
    };
    return map[c] || c;
  };

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap justify-between gap-4 items-start rounded-xl border p-5"
        style={{
          borderColor: "rgba(94,184,232,0.35)",
          background: "linear-gradient(135deg, rgba(94,184,232,0.12) 0%, rgba(255,69,0,0.05) 100%)",
        }}
      >
        <div className="flex gap-3">
          <LifeBuoy size={32} style={{ color: "var(--accent)" }} />
          <div>
            <h1 className="text-2xl font-bold">Support tickets</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Manage customer support requests. Assign tickets, set categories, and track resolution.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select
            className="rounded border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="ALL">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="ALL">All assignees</option>
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.username}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          <span>Subject</span>
          <span>Category</span>
          <span>Assigned</span>
          <span>Status</span>
          <span></span>
        </div>
        {filtered.map((t) => (
          <div key={t.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center border-b" style={{ borderColor: "var(--border)" }}>
            <Link href={`/admin/tickets/${t.id}`} className="text-sm hover:underline" style={{ color: "var(--accent)" }}>
              {t.subject}
            </Link>
            <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: "rgba(0,192,239,0.15)", color: "var(--accent)" }}>
              {categoryLabel(t.category || "GENERAL")}
            </span>
            <select
              className="text-xs rounded border px-2 py-1 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={t.assignedToId || ""}
              onChange={(e) => setAssignee(t.id, e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.username}</option>
              ))}
            </select>
            <select
              className="text-xs rounded border px-2 py-1 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={t.status}
              onChange={(e) => setStatus(t.id, e.target.value)}
            >
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <Link href={`/admin/tickets/${t.id}`} className="text-xs" style={{ color: "var(--accent)" }}>
              View
            </Link>
          </div>
        ))}
        {!filtered.length && (
          <p className="p-4 text-sm text-center" style={{ color: "var(--muted)" }}>No tickets match your filters.</p>
        )}
      </div>
    </div>
  );
}
