import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getUnreadCount } from "@/lib/panel-notifications";
import { PanelRole } from "@prisma/client";

const INBOX_ROLES: PanelRole[] = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER];

export async function GET() {
  const session = await requireSession(INBOX_ROLES);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const count = await getUnreadCount(session);
  return NextResponse.json({ count });
}
