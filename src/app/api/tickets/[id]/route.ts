import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getTicketForUser(id: string, userId: string, isAdmin: boolean) {
  return prisma.ticket.findFirst({
    where: isAdmin ? { id } : { id, userId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, email: true, name: true, role: true } },
        },
      },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ticket = await getTicketForUser(id, user.id, user.role === "ADMIN");

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getTicketForUser(id, user.id, user.role === "ADMIN");
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await request.json());

    if (user.role !== "ADMIN") {
      if (body.status && body.status !== "CLOSED") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (body.priority) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        status: body.status,
        priority: body.priority,
      },
    });

    return NextResponse.json({ ticket });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
