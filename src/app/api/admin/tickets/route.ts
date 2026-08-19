import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { forwardPanelFeedbackToVendor } from "@/lib/vendor-feedback";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
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
  }).catch(() => []);
  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const category = (body.category as TicketCategory) ?? TicketCategory.SUPPORT;
  const ticket = await prisma.ticket.create({
    data: {
      subject: body.subject,
      body: body.body,
      priority: (body.priority as TicketPriority) ?? TicketPriority.NORMAL,
      category,
      status: TicketStatus.OPEN,
      createdById: session.id,
      assignedToId: body.assignedToId || null,
      lineId: body.lineId || null,
    },
  });

  if (category === "SUGGESTION" || category === "REPORT" || category === "BUG") {
    void forwardPanelFeedbackToVendor({
      kind: category,
      subject: String(body.subject ?? ""),
      body: String(body.body ?? ""),
      username: session.username ?? null,
    });
  }

  void import("@/lib/panel-chat-notify").then(({ notifyTicketCreated }) =>
    notifyTicketCreated({
      ticketId: ticket.id,
      subject: String(body.subject ?? ""),
      createdById: session.id,
      createdByUsername: session.username,
    })
  );

  return NextResponse.json({ ticket });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.map(String)
    : body.id
      ? [String(body.id)]
      : [];
  if (!ids.length) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  const data: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToId?: string | null;
  } = {};
  if (body.status) data.status = body.status as TicketStatus;
  if (body.priority) data.priority = body.priority as TicketPriority;
  if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null;

  if (ids.length === 1) {
    const ticket = await prisma.ticket.update({ where: { id: ids[0] }, data });
    return NextResponse.json({ ticket });
  }

  await prisma.ticket.updateMany({ where: { id: { in: ids } }, data });
  return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.map(String)
    : body.id
      ? [String(body.id)]
      : [];
  if (!ids.length) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  await prisma.ticketMessage.deleteMany({ where: { ticketId: { in: ids } } }).catch(() => {});
  await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
