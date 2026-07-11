import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const openOnly = searchParams.get("open") === "1";

  try {
    const whereClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) { whereClauses.push(`t.status = $${idx++}`); params.push(status); }
    if (priority) { whereClauses.push(`t.priority = $${idx++}`); params.push(priority); }
    if (openOnly) { whereClauses.push(`t.status != 'CLOSED'`); }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const tickets = await prisma.$queryRawUnsafe(`
      SELECT t.id, t.subject, t.status, t.priority, t.category,
             t."createdAt", t."updatedAt",
             u.username as author_name,
             (SELECT COUNT(*) FROM "TicketMessage" m WHERE m."ticketId" = t.id) as message_count
      FROM "Ticket" t
      LEFT JOIN "PanelUser" u ON t."createdById" = u.id
      ${where}
      ORDER BY t."updatedAt" DESC
      LIMIT 50
    `, ...params);

    const openCount = await prisma.$queryRawUnsafe`
      SELECT COUNT(*)::int as count FROM "Ticket" WHERE status != 'CLOSED'
    `;

    return NextResponse.json({
      openCount: (openCount as Record<string, number>[])[0]?.count ?? 0,
      tickets: (tickets as Record<string, unknown>[]).map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        email: t.author_name ?? "unknown",
        name: t.author_name ?? "unknown",
        messageCount: Number(t.message_count),
        updatedAt: t.updatedAt?.toISOString?.() ?? String(t.updatedAt),
        createdAt: t.createdAt?.toISOString?.() ?? String(t.createdAt),
        messages: [],
      })),
    });
  } catch (e) {
    console.error("[admin/tickets GET]", e);
    return NextResponse.json({ openCount: 0, tickets: [] });
  }
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = patchSchema.parse(await request.json());
    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.priority) data.priority = body.priority;

    const ticket = await prisma.ticket.update({
      where: { id: body.id },
      data,
    });
    return NextResponse.json({ ticket });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

const replySchema = z.object({
  ticketId: z.string(),
  body: z.string().min(1).max(10000),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { ticketId, body } = replySchema.parse(await request.json());

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (ticket.status === "CLOSED") return NextResponse.json({ error: "Ticket is closed" }, { status: 400 });

    const [message] = await prisma.$transaction([
      prisma.ticketMessage.create({
        data: {
          ticketId,
          authorId: admin.id,
          body,
        },
      }),
      prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "IN_PROGRESS", updatedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ message });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Reply failed" }, { status: 500 });
  }
}
