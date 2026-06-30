import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { getResellerDashboardSummary } from "@/lib/dashboard-server-metrics";
import { formatAuditAction } from "@/lib/audit-log";

export async function GET() {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.panelUser.findUnique({
    where: { id: session.id },
    include: { resellerBouquets: { include: { bouquet: true } } },
  });

  const lines = await prisma.line.count({ where: { ownerId: session.id } });
  const activeLines = await prisma.line.count({
    where: { ownerId: session.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
  });

  const [dashboard, logs] = await Promise.all([
    getResellerDashboardSummary(session.id),
    prisma.activityLog.findMany({
      where: {
        userId: session.id,
        createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      },
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    credits: user?.credits ?? 0,
    lines,
    activeLines,
    bouquets: user?.resellerBouquets.map((rb) => rb.bouquet) ?? [],
    dashboard,
    logs: logs.map((log) => ({
      action: log.action,
      label: formatAuditAction(log.action),
      createdAt: log.createdAt,
      fixHref: null,
    })),
  });
}
