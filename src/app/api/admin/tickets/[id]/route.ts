import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, TicketPriority, TicketStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      createdBy: { select: { username: true, displayName: true, role: true } },
      assignedTo: { select: { username: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { username: true, displayName: true, role: true } } },
      },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.role !== PanelRole.ADMIN && ticket.createdById !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ticket });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const data: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToId?: string | null;
  } = {};
  if (body.status) data.status = body.status as TicketStatus;
  if (body.priority) data.priority = body.priority as TicketPriority;
  if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null;

  const ticket = await prisma.ticket.update({ where: { id }, data });
  return NextResponse.json({ ticket });
}
