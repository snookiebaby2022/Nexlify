"use client";

import { use } from "react";
import { TicketDetailView } from "@/components/ticket-detail-view";

export default function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TicketDetailView ticketId={id} listHref="/admin/tickets" isAdmin />;
}
