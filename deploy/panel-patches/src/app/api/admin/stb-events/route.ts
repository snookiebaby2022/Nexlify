import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lineId = req.nextUrl.searchParams.get("lineId");

  let ownedLineIds: string[] | undefined;
  if (session.role !== PanelRole.ADMIN) {
    const owned = await prisma.line.findMany({
      where: { ownerId: session.id },
      select: { id: true },
    });
    ownedLineIds = owned.map((l) => l.id);
    if (ownedLineIds.length === 0) {
      return NextResponse.json({ events: [] });
    }
  }

  const events = await prisma.stbEvent.findMany({
    where: {
      ...(lineId ? { lineId } : {}),
      ...(ownedLineIds ? { lineId: { in: lineId ? ownedLineIds.filter((id) => id === lineId) : ownedLineIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ events });
}
