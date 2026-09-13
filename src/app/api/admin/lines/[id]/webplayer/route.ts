import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { createWebplayerLinkToken } from "@/lib/webplayer-link";
import { prisma } from "@/lib/prisma";
import { denyUnlessResellerPermission, RESELLER_PERMS } from "@/lib/reseller-permissions";
import { adminOrLineOwnerWhere } from "@/lib/line-owner-filter";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const viewDenied = await denyUnlessResellerPermission(session, RESELLER_PERMS.LINES_VIEW);
  if (viewDenied) return viewDenied;
  const { id } = await ctx.params;
  const line = await prisma.line.findFirst({
    where: await adminOrLineOwnerWhere(session, id),
    select: { id: true },
  });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
  const token = await createWebplayerLinkToken(line.id);
  return NextResponse.json({ url: `/webplayer?t=${encodeURIComponent(token)}` });
}
