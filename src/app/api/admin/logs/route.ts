import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const action = req.nextUrl.searchParams.get("action")?.trim();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const take = Math.min(500, Math.max(10, parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10)));

  const where: Prisma.ActivityLogWhereInput = {};
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (q) {
    where.OR = [
      { entity: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { user: { username: { contains: q, mode: "insensitive" } } },
      { line: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  const logs = await prisma.activityLog.findMany({
    where,
    take,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true, role: true } },
      line: { select: { username: true } },
    },
  });
  return NextResponse.json({ logs });
}
