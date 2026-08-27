import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { formatTicketRef } from "@/lib/tickets";

/** Lightweight poll endpoint for admin ticket badges / desktop alerts. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const needsAttentionWhere: Prisma.TicketWhereInput = {
      status: { in: ["OPEN", "IN_PROGRESS"] },
    };

    const [needsAttention, openCount, latest] = await Promise.all([
      prisma.ticket.count({ where: needsAttentionWhere }),
      prisma.ticket.count({ where: { status: { not: "CLOSED" } } }),
      prisma.ticket.findMany({
        where: needsAttentionWhere,
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          updatedAt: true,
          user: { select: { email: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      needsAttention,
      openCount,
      latest: latest.map((t) => ({
        id: t.id,
        ref: formatTicketRef(t.id),
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        email: t.user.email,
        name: t.user.name,
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[admin/tickets/alerts]", e);
    return NextResponse.json({ needsAttention: 0, openCount: 0, latest: [] });
  }
}
