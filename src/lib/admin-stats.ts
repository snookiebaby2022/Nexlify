import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Licenses that count as a paid sale (excludes trial + seeded demo). */
function paidLicenseWhere() {
  return {
    plan: { slug: { not: TRIAL_PLAN_SLUG } },
    NOT: [
      { notes: { contains: "Public demo" } },
      { user: { email: "demo@nexlify.live" } },
    ],
  };
}

function trialLicenseWhere() {
  return { plan: { slug: TRIAL_PLAN_SLUG } };
}

export async function getAdminStats() {
  const now = new Date();
  const since7 = daysAgo(7);
  const since30 = daysAgo(30);

  const trialPlan = await prisma.plan.findFirst({
    where: { slug: TRIAL_PLAN_SLUG },
    select: { id: true },
  });

  const [
    trialsTotal,
    trialsActive,
    trialsLast7,
    trialsLast30,
    trialUsers,
    paidTotal,
    paidLast7,
    paidLast30,
    whmcsSales,
    stripeSales,
    manualSales,
    orderRevenue,
    plans,
    byPlanRaw,
    recentTrials,
    recentPaid,
    openTickets,
    couponOrders,
    trialUserIds,
    paidUserIds,
    utmUsers,
    utmOrders,
  ] = await Promise.all([
    prisma.license.count({ where: trialLicenseWhere() }),
    prisma.license.count({
      where: {
        ...trialLicenseWhere(),
        status: { in: ["ACTIVE", "UNUSED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    prisma.license.count({
      where: { ...trialLicenseWhere(), createdAt: { gte: since7 } },
    }),
    prisma.license.count({
      where: { ...trialLicenseWhere(), createdAt: { gte: since30 } },
    }),
    prisma.license.groupBy({
      by: ["userId"],
      where: trialLicenseWhere(),
    }),
    prisma.license.count({ where: paidLicenseWhere() }),
    prisma.license.count({
      where: { ...paidLicenseWhere(), createdAt: { gte: since7 } },
    }),
    prisma.license.count({
      where: { ...paidLicenseWhere(), createdAt: { gte: since30 } },
    }),
    prisma.license.count({
      where: { ...paidLicenseWhere(), whmcsServiceId: { not: null } },
    }),
    prisma.license.count({
      where: {
        ...paidLicenseWhere(),
        order: { stripeSessionId: { not: null } },
      },
    }),
    prisma.license.count({
      where: {
        ...paidLicenseWhere(),
        whmcsServiceId: null,
        OR: [{ orderId: null }, { order: { stripeSessionId: null } }],
        notes: { contains: "Manual issue" },
      },
    }),
    prisma.order.aggregate({
      where: {
        status: "COMPLETED",
        amountCents: { gt: 0 },
        plan: { slug: { not: TRIAL_PLAN_SLUG } },
      },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.plan.findMany({
      where: { active: true, slug: { not: TRIAL_PLAN_SLUG } },
      select: { id: true, name: true, slug: true, priceCents: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.license.groupBy({
      by: ["planId"],
      where: paidLicenseWhere(),
      _count: { _all: true },
    }),
    prisma.license.findMany({
      where: trialLicenseWhere(),
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { email: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.license.findMany({
      where: paidLicenseWhere(),
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { email: true } },
        plan: { select: { name: true } },
        order: { select: { amountCents: true, stripeSessionId: true } },
      },
    }),
    prisma.ticket.count({
      where: { status: { not: "CLOSED" } },
    }),
    prisma.order.findMany({
      where: {
        status: "COMPLETED",
        couponCode: { not: null },
        amountCents: { gt: 0 },
      },
      select: { couponCode: true, amountCents: true },
    }),
    trialPlan
      ? prisma.license.findMany({
          where: { planId: trialPlan.id },
          select: { userId: true },
          distinct: ["userId"],
        })
      : Promise.resolve([]),
    prisma.license.findMany({
      where: paidLicenseWhere(),
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.user.findMany({
      where: { utmSource: { not: null } },
      select: { utmSource: true, utmMedium: true, utmCampaign: true },
    }),
    prisma.order.findMany({
      where: {
        status: "COMPLETED",
        amountCents: { gt: 0 },
        utmSource: { not: null },
      },
      select: { utmSource: true, utmMedium: true, utmCampaign: true, amountCents: true },
    }),
  ]);

  const planNameById = Object.fromEntries(plans.map((p) => [p.id, p]));

  const salesByPlan = byPlanRaw
    .map((row) => ({
      planId: row.planId,
      name: planNameById[row.planId]?.name ?? "Unknown",
      slug: planNameById[row.planId]?.slug ?? "unknown",
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const websiteSales = Math.max(0, paidTotal - whmcsSales - manualSales);

  const couponMap = new Map<string, { uses: number; revenueCents: number }>();
  for (const o of couponOrders) {
    const code = o.couponCode ?? "unknown";
    const cur = couponMap.get(code) ?? { uses: 0, revenueCents: 0 };
    cur.uses += 1;
    cur.revenueCents += o.amountCents;
    couponMap.set(code, cur);
  }
  const coupons = [...couponMap.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.uses - a.uses);

  const paidSet = new Set(paidUserIds.map((r) => r.userId));
  const trialOnlyUsers = trialUserIds.filter((t) => !paidSet.has(t.userId)).length;
  const convertedUsers = trialUserIds.filter((t) => paidSet.has(t.userId)).length;
  const trialUserCount = trialUserIds.length;
  const conversionRate =
    trialUserCount > 0 ? Math.round((convertedUsers / trialUserCount) * 1000) / 10 : 0;

  type UtmKey = string;
  const utmMap = new Map<
    UtmKey,
    { source: string; medium: string | null; campaign: string | null; signups: number; orders: number; revenueCents: number }
  >();

  function utmKey(source: string, medium: string | null, campaign: string | null) {
    return `${source}|${medium ?? ""}|${campaign ?? ""}`;
  }

  for (const u of utmUsers) {
    if (!u.utmSource) continue;
    const key = utmKey(u.utmSource, u.utmMedium, u.utmCampaign);
    const cur = utmMap.get(key) ?? {
      source: u.utmSource,
      medium: u.utmMedium,
      campaign: u.utmCampaign,
      signups: 0,
      orders: 0,
      revenueCents: 0,
    };
    cur.signups += 1;
    utmMap.set(key, cur);
  }

  for (const o of utmOrders) {
    if (!o.utmSource) continue;
    const key = utmKey(o.utmSource, o.utmMedium, o.utmCampaign);
    const cur = utmMap.get(key) ?? {
      source: o.utmSource,
      medium: o.utmMedium,
      campaign: o.utmCampaign,
      signups: 0,
      orders: 0,
      revenueCents: 0,
    };
    cur.orders += 1;
    cur.revenueCents += o.amountCents;
    utmMap.set(key, cur);
  }

  const utmSummary = [...utmMap.values()].sort(
    (a, b) => b.signups + b.orders - (a.signups + a.orders),
  );

  return {
    generatedAt: now.toISOString(),
    openTickets,
    trials: {
      total: trialsTotal,
      active: trialsActive,
      expired: Math.max(0, trialsTotal - trialsActive),
      uniqueUsers: trialUsers.length,
      last7Days: trialsLast7,
      last30Days: trialsLast30,
    },
    conversion: {
      trialUsers: trialUserCount,
      convertedToPaid: convertedUsers,
      trialOnly: trialOnlyUsers,
      ratePercent: conversionRate,
    },
    sales: {
      total: paidTotal,
      last7Days: paidLast7,
      last30Days: paidLast30,
      byChannel: {
        whmcs: whmcsSales,
        stripe: stripeSales,
        website: websiteSales,
        manual: manualSales,
      },
      byPlan: salesByPlan,
      revenueCents: orderRevenue._sum.amountCents ?? 0,
      completedPaidOrders: orderRevenue._count,
    },
    coupons,
    utmSummary,
    umami: {
      dashboardUrl: "https://analytics.nexlify.live/dashboard",
      websiteId: process.env.UMAMI_WEBSITE_ID ?? null,
    },
    recentTrials: recentTrials.map((l) => ({
      id: l.id,
      email: l.user.email,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      expiresAt: l.expiresAt?.toISOString() ?? null,
    })),
    recentSales: recentPaid.map((l) => ({
      email: l.user.email,
      plan: l.plan.name,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      source: l.whmcsServiceId
        ? "WHMCS"
        : l.order?.stripeSessionId
          ? "Stripe"
          : l.notes?.includes("Manual")
            ? "Manual"
            : "Website",
      amountCents: l.order?.amountCents ?? null,
    })),
  };
}

export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;
