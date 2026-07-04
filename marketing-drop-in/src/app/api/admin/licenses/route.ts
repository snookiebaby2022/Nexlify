import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [licenses, stats, recentActivations] = await Promise.all([
    prisma.license.findMany({
      include: {
        user: { select: { email: true, name: true } },
        plan: { select: { name: true, slug: true, priceCents: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.license.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.license.findMany({
      where: { activatedAt: { not: null } },
      orderBy: { activatedAt: "desc" },
      take: 10,
      include: {
        user: { select: { email: true, name: true } },
        plan: { select: { name: true } },
      },
    }),
  ]);

  const now = Date.now();
  const installations = licenses
    .filter((l) => l.machineId && l.status === "ACTIVE")
    .map((l) => {
      const lastSync = l.lastSyncAt ? new Date(l.lastSyncAt).getTime() : 0;
      const hoursSinceSync = lastSync ? Math.round((now - lastSync) / 3600000) : null;
      return {
        id: l.id,
        key: l.key.slice(0, 20) + "...",
        email: l.user.email,
        name: l.user.name,
        plan: l.plan.name,
        machineId: l.machineId,
        panelUrl: l.panelUrl,
        status: l.status,
        maxLines: l.maxLines,
        activatedAt: l.activatedAt,
        lastSyncAt: l.lastSyncAt,
        hoursSinceSync,
        isOnline: hoursSinceSync !== null && hoursSinceSync < 24,
        expiresAt: l.expiresAt,
      };
    });

  const statusCounts: Record<string, number> = {};
  for (const s of stats) {
    statusCounts[s.status] = s._count.id;
  }

  return NextResponse.json({
    summary: {
      total: licenses.length,
      active: statusCounts.ACTIVE ?? 0,
      expired: statusCounts.EXPIRED ?? 0,
      revoked: statusCounts.REVOKED ?? 0,
      suspended: statusCounts.SUSPENDED ?? 0,
      unused: statusCounts.UNUSED ?? 0,
      online: installations.filter((i) => i.isOnline).length,
    },
    installations,
    recentActivations: recentActivations.map((l) => ({
      email: l.user.email,
      plan: l.plan.name,
      activatedAt: l.activatedAt,
      panelUrl: l.panelUrl,
    })),
  });
}
