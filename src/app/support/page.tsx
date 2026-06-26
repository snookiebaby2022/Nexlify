import Link from "next/link";
import { redirect } from "next/navigation";
import { NewTicketForm } from "@/components/support/NewTicketForm";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { site } from "@/lib/site";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/support");

import {
  formatTicketRef,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  ticketStatusColor,
} from "@/lib/tickets";
import { formatDate } from "@/lib/format";

export default async function SupportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/support");

  const tickets = await prisma.ticket.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { email: true } },
      _count: { select: { messages: true } },
    },
  });

  const openCount = tickets.filter((t) => t.status !== "CLOSED").length;

  return (
    <div className="mesh-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
              {site.domain}
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
              Support tickets
            </h1>
            <p className="mt-2 text-[var(--muted)]">
              {openCount} open · Panel licenses, WHMCS billing, and technical help
            </p>
          </div>
          {user.role === "ADMIN" && (
            <Link
              href="/admin/tickets"
              className="rounded-full border border-amber-500/40 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/10"
            >
              Admin ticket queue
            </Link>
          )}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <NewTicketForm />
          </div>

          <div className="lg:col-span-3 space-y-3">
            <h2 className="font-display text-lg font-semibold text-white">Your tickets</h2>
            {tickets.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center text-[var(--muted)]">
                No tickets yet. Submit one if you need help.
              </div>
            ) : (
              tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/support/${t.id}`}
                  className="block glass rounded-2xl p-5 hover:border-violet-500/30 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-violet-300">
                      {formatTicketRef(t.id)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ticketStatusColor(t.status)}`}
                    >
                      {TICKET_STATUS_LABEL[t.status]}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {TICKET_PRIORITY_LABEL[t.priority]}
                    </span>
                  </div>
                  <p className="mt-2 font-medium text-white">{t.subject}</p>
                  {user.role === "ADMIN" && (
                    <p className="mt-1 text-xs text-[var(--muted)]">{t.user.email}</p>
                  )}
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Updated {formatDate(t.updatedAt)} · {t._count.messages} messages
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
