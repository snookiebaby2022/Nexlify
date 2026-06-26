"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TicketsList, type TicketRow } from "@/components/ticket-ui";
import { LifeBuoy } from "lucide-react";

export default function ResellerTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/tickets").then((r) => r.json()).then((d) => setTickets(d.tickets ?? []));
  }, []);

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
            <h1 className="text-2xl font-bold">Support</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Open a ticket and chat with the panel admin team
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
      <TicketsList tickets={tickets} detailBase="/reseller/tickets" />
    </div>
  );
}
