"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import type { TicketRow } from "@/components/ticket-ui";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterAssignee, setFilterAssignee] = useState("ALL");
  const [admins, setAdmins] = useState<{ id: string; username: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function load() {
    fetch("/api/admin/tickets")
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets ?? []));
    fetch("/api/admin/resellers")
      .then((r) => r.json())
      .then((d) => setAdmins((d.users ?? []).filter((u: { role: string }) => u.role === "ADMIN")));
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

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selected.has(t.id));

  const toggleAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((t) => t.id)));
  }, [allFilteredSelected, filtered]);

  async function bulkSetStatus(status: string) {
    if (!selected.size) return;
    setBulkBusy(true);
    await fetch("/api/admin/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], status }),
    });
    setBulkBusy(false);
    setSelected(new Set());
    load();
  }

  async function bulkDelete() {
    if (!selected.size || !confirm(`Delete ${selected.size} ticket(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    await fetch("/api/admin/tickets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setBulkBusy(false);
    setSelected(new Set());
    load();
  }

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
              Manage customer support requests. Select tickets to open, close, or delete in bulk.
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
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
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
              <option key={a.id} value={a.id}>
                {a.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border"
          style={{ borderColor: "var(--border)" }}
          onClick={toggleAll}
        >
          {allFilteredSelected ? "Clear selection" : "Select all"}
        </button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {selected.size} selected
        </span>
        <button
          type="button"
          disabled={!selected.size || bulkBusy}
          className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-40"
          style={{ background: "var(--accent)" }}
          onClick={() => bulkSetStatus("OPEN")}
        >
          Mark open
        </button>
        <button
          type="button"
          disabled={!selected.size || bulkBusy}
          className="text-xs px-3 py-1.5 rounded border disabled:opacity-40"
          style={{ borderColor: "var(--border)" }}
          onClick={() => bulkSetStatus("CLOSED")}
        >
          Mark closed
        </button>
        <button
          type="button"
          disabled={!selected.size || bulkBusy}
          className="text-xs px-3 py-1.5 rounded disabled:opacity-40"
          style={{ color: "var(--danger)", border: "1px solid var(--danger)" }}
          onClick={bulkDelete}
        >
          Delete
        </button>
      </div>

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <span>
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all" />
          </span>
          <span>Subject</span>
          <span>Category</span>
          <span>Assigned</span>
          <span>Status</span>
          <span></span>
        </div>
        {filtered.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(t.id)) next.delete(t.id);
                else next.add(t.id);
                setSelected(next);
              }}
              aria-label={`Select ${t.subject}`}
            />
            <Link href={`/admin/tickets/${t.id}`} className="text-sm hover:underline" style={{ color: "var(--accent)" }}>
              {t.subject}
            </Link>
            <span
              className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: "rgba(0,192,239,0.15)", color: "var(--accent)" }}
            >
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
                <option key={a.id} value={a.id}>
                  {a.username}
                </option>
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
          <p className="p-4 text-sm text-center" style={{ color: "var(--muted)" }}>
            No tickets match your filters.
          </p>
        )}
      </div>
    </div>
  );
}
