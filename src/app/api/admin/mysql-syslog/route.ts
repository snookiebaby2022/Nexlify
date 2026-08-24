import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 200), 500);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { job: { contains: q, mode: "insensitive" } },
      { status: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
    ];
  }

  const logs = await prisma.cronRunLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ logs });
}
