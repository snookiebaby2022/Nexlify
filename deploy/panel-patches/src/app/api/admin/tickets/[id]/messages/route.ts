import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: ticketId } = await params;
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.role !== PanelRole.ADMIN && ticket.createdById !== session.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const message = await prisma.ticketMessage.create({
    data: { ticketId, authorId: session.id, body: text },
    include: { author: { select: { username: true, displayName: true, role: true } } },
  });

  await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });

  return NextResponse.json({ message });
}
