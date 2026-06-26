"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";

export function TicketAdminControls({
  ticketId,
  status,
  priority,
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function update(patch: { status?: TicketStatus; priority?: TicketPriority }) {
    setLoading(true);
    await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        disabled={loading}
        value={status}
        onChange={(e) => update({ status: e.target.value as TicketStatus })}
        className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white"
      >
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="WAITING_CUSTOMER">Awaiting customer</option>
        <option value="CLOSED">Closed</option>
      </select>
      <select
        disabled={loading}
        value={priority}
        onChange={(e) => update({ priority: e.target.value as TicketPriority })}
        className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white"
      >
        <option value="LOW">Low</option>
        <option value="NORMAL">Normal</option>
        <option value="HIGH">High</option>
        <option value="URGENT">Urgent</option>
      </select>
    </div>
  );
}
