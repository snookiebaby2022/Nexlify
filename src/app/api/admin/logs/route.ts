import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseLogLimit } from "@/lib/log-page";

function activityWhere(req: NextRequest): Prisma.ActivityLogWhereInput {
  const actionFilter = req.nextUrl.searchParams.get("action")?.trim();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const where: Prisma.ActivityLogWhereInput = {};
  if (actionFilter) {
    where.action = { contains: actionFilter, mode: "insensitive" };
  }
  if (q) {
    where.OR = [
      { entity: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { user: { username: { contains: q, mode: "insensitive" } } },
      { line: { username: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = parseLogLimit(req.nextUrl.searchParams.get("limit"));
  const where = activityWhere(req);

  const logs = await prisma.activityLog.findMany({
    where,
    take,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true, role: true } },
      line: { select: { username: true } },
    },
  }).catch(() => []);
  return NextResponse.json({ logs });
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = activityWhere(req);
  const result = await prisma.activityLog.deleteMany({ where });
  return NextResponse.json({ ok: true, deleted: result.count });
}
