"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { TicketsList, type TicketRow } from "@/components/ticket-ui";

export default function ResellerTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/reseller/tickets")
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allSelected = tickets.length > 0 && tickets.every((t) => selected.has(t.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(tickets.map((t) => t.id)));
  }

  async function bulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} ticket(s)? This cannot be undone.`)) return;
    setBusy(true);
    await fetch("/api/reseller/tickets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setBusy(false);
    setSelected(new Set());
    load();
  }

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap justify-between gap-4 items-start rounded-xl border p-5"
        style={{
          borderColor: "rgba(124,58,237,0.35)",
          background: "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(94,184,232,0.08) 100%)",
        }}
      >
        <div className="flex gap-3">
          <LifeBuoy size={32} style={{ color: "#a78bfa" }} />
          <div>
            <h1 className="text-2xl font-bold">My tickets</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Only tickets you created are shown here
            </p>
          </div>
        </div>
        <Link
          href="/reseller/tickets/new"
          className="text-sm px-4 py-2.5 rounded-full font-semibold"
          style={{ background: "#ff4500", color: "#fff" }}
        >
          + New ticket
        </Link>
      </div>

      {tickets.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all
          </label>
          <button
            type="button"
            disabled={busy || !selected.size}
            onClick={() => void bulkDelete()}
            className="text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
            style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
          >
            Delete selected ({selected.size})
          </button>
        </div>
      )}

      <TicketsList
        tickets={tickets}
        detailBase="/reseller/tickets"
        selectable
        selectedIds={selected}
        onToggleSelect={(id) => {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
      />
    </div>
  );
}
