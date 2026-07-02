import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = Math.min(
    200,
    Math.max(10, parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10) || 100)
  );

  const logs = await prisma.activityLog.findMany({
    where: { userId: session.id },
    take,
    orderBy: { createdAt: "desc" },
    include: {
      line: { select: { username: true } },
    },
  });

  return NextResponse.json({ logs });
}
