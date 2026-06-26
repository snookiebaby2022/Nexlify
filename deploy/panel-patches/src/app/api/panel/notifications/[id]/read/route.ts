import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { canUserAccessNotification, markNotificationRead } from "@/lib/panel-notifications";
import { PanelRole } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const INBOX_ROLES: PanelRole[] = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER];

export async function POST(_req: Request, { params }: Params) {
  const session = await requireSession(INBOX_ROLES);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const allowed = await canUserAccessNotification(id, session);
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const read = await markNotificationRead(id, session.id);
  if (!read) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ readAt: read.readAt.toISOString() });
}
