import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { kickLineConnections } from "@/lib/connections";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { denyUnlessResellerPermission, RESELLER_PERMS } from "@/lib/reseller-permissions";
import { adminOrLineOwnerWhere } from "@/lib/line-owner-filter";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const kickDenied = await denyUnlessResellerPermission(session, RESELLER_PERMS.CONNECTIONS_KICK);
  if (kickDenied) return kickDenied;

  const { id } = await ctx.params;

  const line = await prisma.line.findFirst({
    where: await adminOrLineOwnerWhere(session, id),
    select: { id: true },
  });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const killed = await kickLineConnections(id);
  return NextResponse.json({ ok: true, killed });
}
