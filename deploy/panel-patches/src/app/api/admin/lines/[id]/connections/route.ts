import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const where =
    session.role === PanelRole.ADMIN ? { lineId: id } : { lineId: id, line: { ownerId: session.id } };

  const line = await prisma.line.findFirst({
    where: session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id },
    select: { id: true },
  });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await prisma.liveConnection.deleteMany({ where });
  return NextResponse.json({ ok: true, killed: result.count });
}
