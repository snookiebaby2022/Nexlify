import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TicketPriority } from "@/generated/prisma/client";

const createSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(10).max(10000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

const replySchema = z.object({
  reply: z.literal(true),
  ticketId: z.string(),
  body: z.string().min(1).max(10000),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const json = await request.json();

    if (json.reply === true) {
      const { ticketId, body } = replySchema.parse(json);
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket || (ticket.userId !== user.id && user.role !== "ADMIN")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (ticket.status === "CLOSED") {
        return NextResponse.json({ error: "Ticket is closed" }, { status: 400 });
      }

      await prisma.$transaction([
        prisma.ticketMessage.create({
          data: {
            ticketId,
            authorId: user.id,
            body,
            isStaff: user.role === "ADMIN",
          },
        }),
        prisma.ticket.update({
          where: { id: ticketId },
          data: {
            status: user.role === "ADMIN" ? "WAITING_CUSTOMER" : "OPEN",
            updatedAt: new Date(),
          },
        }),
      ]);

      return NextResponse.json({ ok: true });
    }

    const { subject, body, priority } = createSchema.parse(json);

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          userId: user.id,
          subject,
          priority: (priority ?? "NORMAL") as TicketPriority,
        },
      });
      await tx.ticketMessage.create({
        data: {
          ticketId: created.id,
          authorId: user.id,
          body,
          isStaff: false,
        },
      });
      return created;
    });

    return NextResponse.json({ ticket: { id: ticket.id } });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[support/tickets POST]", e);
    return NextResponse.json({ error: "Could not create ticket" }, { status: 500 });
  }
}
