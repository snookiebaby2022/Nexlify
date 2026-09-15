import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { getResellerDashboardSummary } from "@/lib/dashboard-server-metrics";
import { ownerLineOwnerIds } from "@/lib/owner-scope";
import { formatAuditAction } from "@/lib/audit-log";
import type { SessionUser } from "@/lib/auth";
import { cacheGetOrSet } from "@/lib/cache";

async function resellerSummaryCacheKey(session: SessionUser) {
  const ids = await ownerLineOwnerIds(session);
  return `stats:reseller-summary:${(ids ?? [session.id]).slice().sort().join(",")}`;
}

export async function loadResellerHeaderStats(session: SessionUser) {
  const summaryKey = await resellerSummaryCacheKey(session);
  const [dashboard, credits] = await Promise.all([
    cacheGetOrSet(summaryKey, 30, async () =>
      getResellerDashboardSummary((await ownerLineOwnerIds(session)) ?? [session.id]),
    ),
    prisma.panelUser.findUnique({
      where: { id: session.id },
      select: { credits: true },
    }),
  ]);
  return {
    credits: credits?.credits ?? 0,
    dashboard,
  };
}

export async function loadResellerDashboardStats(session: SessionUser) {
  const user = await prisma.panelUser.findUnique({
    where: { id: session.id },
    include: { resellerBouquets: { include: { bouquet: true } } },
  });

  const ownerIds = (await ownerLineOwnerIds(session)) ?? [session.id];
  const lineOwnerFilter =
    ownerIds.length === 1 ? { ownerId: ownerIds[0] } : { ownerId: { in: ownerIds } };
  const summaryKey = await resellerSummaryCacheKey(session);

  const [lines, activeLines, dashboard, logs] = await Promise.all([
    prisma.line.count({ where: lineOwnerFilter }),
    prisma.line.count({
      where: {
        ...lineOwnerFilter,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    }),
    cacheGetOrSet(summaryKey, 30, () => getResellerDashboardSummary(ownerIds)),
    prisma.activityLog.findMany({
      where: {
        userId: session.id,
        createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      },
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    credits: user?.credits ?? 0,
    lines,
    activeLines,
    bouquets: user?.resellerBouquets.map((rb) => rb.bouquet) ?? [],
    dashboard,
    logs: logs.map((log) => ({
      action: log.action,
      label: formatAuditAction(log.action),
      createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
      fixHref: null,
    })),
  };
}

export async function requireResellerSession() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || (session.role !== PanelRole.RESELLER && session.role !== PanelRole.SUB_RESELLER)) {
    return null;
  }
  return session;
}
