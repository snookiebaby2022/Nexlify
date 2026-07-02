import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listInboxForUser } from "@/lib/panel-notifications";
import { PanelRole } from "@prisma/client";

const INBOX_ROLES: PanelRole[] = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER];

export async function GET(req: NextRequest) {
  const session = await requireSession(INBOX_ROLES);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50)));
  const notifications = await listInboxForUser(session, { limit });
  return NextResponse.json({ notifications });
}
