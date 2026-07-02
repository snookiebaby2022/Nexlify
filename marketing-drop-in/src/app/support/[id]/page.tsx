import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TicketThread } from "@/components/support/TicketThread";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  formatTicketRef,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  ticketStatusColor,
} from "@/lib/tickets";

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/support");

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { email: true, name: true, role: true } },
        },
      },
    },
  });

  if (!ticket) notFound();
  if (user.role !== "ADMIN" && ticket.userId !== user.id) notFound();

  return (
    <div className="mesh-bg min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <Link href="/support" className="text-sm text-violet-400 hover:underline">
          ← All tickets
        </Link>

        <div className="mt-6 glass rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-violet-300">{formatTicketRef(ticket.id)}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${ticketStatusColor(ticket.status)}`}
            >
              {TICKET_STATUS_LABEL[ticket.status]}
            </span>
            <span className="text-xs text-[var(--muted)]">
              {TICKET_PRIORITY_LABEL[ticket.priority]}
            </span>
          </div>
          <h1 className="font-display mt-3 text-2xl font-bold text-white">{ticket.subject}</h1>
          {user.role === "ADMIN" && (
            <p className="mt-1 text-sm text-[var(--muted)]">{ticket.user.email}</p>
          )}
          <p className="mt-2 text-xs text-[var(--muted)]">
            Opened {formatDate(ticket.createdAt)} · updated {formatDate(ticket.updatedAt)}
          </p>
        </div>

        <TicketThread
          ticketId={ticket.id}
          status={ticket.status}
          messages={ticket.messages.map((m) => ({
            id: m.id,
            body: m.body,
            isStaff: m.isStaff,
            createdAt: m.createdAt.toISOString(),
            authorEmail: m.author.email,
            authorName: m.author.name,
          }))}
          isAdmin={user.role === "ADMIN"}
        />
      </div>
    </div>
  );
}
