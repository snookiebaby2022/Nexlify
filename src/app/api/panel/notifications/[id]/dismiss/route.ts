import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { dismissNotificationForUser } from "@/lib/panel-notifications";
import { PanelRole } from "@prisma/client";

const INBOX_ROLES: PanelRole[] = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER];

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(INBOX_ROLES);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const result = await dismissNotificationForUser(id, session);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, dismissedAt: result.dismissedAt?.toISOString() ?? null });
}
