"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function close() {
    setLoading(true);
    await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={close}
      disabled={loading}
      className="text-xs text-[var(--muted)] hover:text-white underline disabled:opacity-50"
    >
      {loading ? "Closing…" : "Close ticket"}
    </button>
  );
}
