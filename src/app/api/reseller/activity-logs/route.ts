import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = Math.min(
    200,
    Math.max(10, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50)
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
