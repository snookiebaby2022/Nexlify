"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TicketsList, type TicketRow } from "@/components/ticket-ui";
import { LifeBuoy } from "lucide-react";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  function load() {
    fetch("/api/admin/tickets").then((r) => r.json()).then((d) => setTickets(d.tickets ?? []));
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
              Track reseller requests and panel issues
            </p>
          </div>
        </div>
        <Link
          href="/admin/tickets/new"
          className="text-sm px-4 py-2.5 rounded-full font-semibold shrink-0"
          style={{ background: "#ff4500", color: "#fff" }}
        >
          + New ticket
        </Link>
      </div>
      <TicketsList
        tickets={tickets}
        detailBase="/admin/tickets"
        isAdmin
        onStatusChange={setStatus}
      />
    </div>
  );
}
