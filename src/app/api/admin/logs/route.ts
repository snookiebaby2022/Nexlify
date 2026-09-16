import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseLogLimit } from "@/lib/log-page";
import { enrichActivityLogsForDisplay } from "@/lib/log-display";
import { buildActivityLogWhere } from "@/lib/activity-log-query";

function activityWhere(req: NextRequest): Prisma.ActivityLogWhereInput {
  return buildActivityLogWhere({
    actionFilter: req.nextUrl.searchParams.get("action")?.trim(),
    q: req.nextUrl.searchParams.get("q")?.trim(),
  });
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
  const enriched = await enrichActivityLogsForDisplay(logs);
  return NextResponse.json({ logs: enriched });
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
