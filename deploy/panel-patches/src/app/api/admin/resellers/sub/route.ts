import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const resellers = await prisma.panelUser.findMany({
    where: { role: PanelRole.SUB_RESELLER },
    include: {
      parent: { select: { username: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ resellers });
}
