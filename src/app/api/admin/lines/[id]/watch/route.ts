import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getLineWatchSummary } from "@/lib/line-watch";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminOrLineOwnerWhere } from "@/lib/line-owner-filter";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const owned = await prisma.line.findFirst({
    where: await adminOrLineOwnerWhere(session, id),
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const summary = await getLineWatchSummary(id);
  return NextResponse.json(summary);
}
