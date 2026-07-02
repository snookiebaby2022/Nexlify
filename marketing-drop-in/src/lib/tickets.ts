import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_CUSTOMER: "Awaiting your reply",
  CLOSED: "Closed",
};

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export function ticketStatusColor(status: TicketStatus): string {
  switch (status) {
    case "OPEN":
      return "bg-sky-500/20 text-sky-300";
    case "IN_PROGRESS":
      return "bg-violet-500/20 text-violet-300";
    case "WAITING_CUSTOMER":
      return "bg-amber-500/20 text-amber-300";
    case "CLOSED":
      return "bg-slate-500/20 text-slate-400";
  }
}

export function formatTicketRef(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}
