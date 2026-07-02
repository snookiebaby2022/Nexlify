import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/admin/tickets");

import {
  formatTicketRef,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  ticketStatusColor,
} from "@/lib/tickets";

export default async function AdminTicketsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/tickets");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const tickets = await prisma.ticket.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  const open = tickets.filter((t) => t.status !== "CLOSED").length;

  return (
    <div className="mesh-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <Link href="/admin" className="text-sm text-violet-400 hover:underline">
          ← Admin
        </Link>
        <h1 className="font-display mt-4 text-3xl font-bold text-white">Ticket queue</h1>
        <p className="mt-2 text-[var(--muted)]">
          {open} open / {tickets.length} total
        </p>

        <div className="mt-10 space-y-3">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/support/${t.id}`}
              className="flex flex-wrap items-center justify-between gap-4 glass rounded-2xl p-5 hover:border-violet-500/30"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-violet-300">{formatTicketRef(t.id)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${ticketStatusColor(t.status)}`}
                  >
                    {TICKET_STATUS_LABEL[t.status]}
                  </span>
                  <span className="text-xs text-amber-400/90">
                    {TICKET_PRIORITY_LABEL[t.priority]}
                  </span>
                </div>
                <p className="mt-2 font-medium text-white">{t.subject}</p>
                <p className="text-sm text-[var(--muted)]">
                  {t.user.name ? `${t.user.name} · ` : ""}
                  {t.user.email}
                </p>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {formatDate(t.updatedAt)} · {t._count.messages} msgs
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
