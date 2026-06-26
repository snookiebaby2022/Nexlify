import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  body: z.string().min(1).max(10000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ticket = await prisma.ticket.findFirst({
    where: user.role === "ADMIN" ? { id } : { id, userId: user.id },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ticket.status === "CLOSED") {
    return NextResponse.json({ error: "Ticket is closed" }, { status: 400 });
  }

  try {
    const { body } = schema.parse(await request.json());
    const isStaff = user.role === "ADMIN";

    const [message] = await prisma.$transaction([
      prisma.ticketMessage.create({
        data: {
          ticketId: id,
          authorId: user.id,
          body,
          isStaff,
        },
        include: {
          author: { select: { email: true, name: true, role: true } },
        },
      }),
      prisma.ticket.update({
        where: { id },
        data: {
          status: isStaff ? "WAITING_CUSTOMER" : "IN_PROGRESS",
          updatedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ message });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
