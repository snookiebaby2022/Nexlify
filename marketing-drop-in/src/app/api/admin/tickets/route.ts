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

  try {
    const tickets = await prisma.ticket.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        _count: { select: { messages: true } },
      },
    });

    const openCount = await prisma.ticket.count({
      where: { status: { not: "CLOSED" } },
    });

    return NextResponse.json({
      openCount,
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        email: "unknown",
        name: "unknown",
        messageCount: t._count.messages,
        updatedAt: t.updatedAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        messages: t.messages.map((m) => ({
          id: m.id,
          body: m.body,
          isStaff: false,
          createdAt: m.createdAt.toISOString(),
          authorEmail: "unknown",
        })),
      })),
    });
  } catch (e) {
    console.error("[admin/tickets GET]", e);
    return NextResponse.json({ openCount: 0, tickets: [] });
  }
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "CLOSED"]).optional(),
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
        data: { status: "WAITING_CUSTOMER", updatedAt: new Date() },
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
