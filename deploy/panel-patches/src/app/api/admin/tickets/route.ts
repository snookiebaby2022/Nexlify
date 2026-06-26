import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, TicketPriority, TicketStatus } from "@prisma/client";

export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tickets = await prisma.ticket.findMany({
    where:
      session.role === PanelRole.ADMIN ? undefined : { createdById: session.id },
    include: {
      createdBy: { select: { username: true } },
      assignedTo: { select: { username: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const ticket = await prisma.ticket.create({
    data: {
      subject: body.subject,
      body: body.body,
      priority: (body.priority as TicketPriority) ?? TicketPriority.NORMAL,
      status: TicketStatus.OPEN,
      createdById: session.id,
      assignedToId: body.assignedToId || null,
      lineId: body.lineId || null,
    },
  });
  return NextResponse.json({ ticket });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      status: body.status,
      priority: body.priority,
      assignedToId: body.assignedToId,
    },
  });
  return NextResponse.json({ ticket });
}
