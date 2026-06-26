import { prisma } from "@/lib/prisma";
import { getStoredLicense } from "@/lib/license/state";
import { isPanelDemoHost } from "@/lib/panel-demo-host";

export type PlanLimits = {
  planSlug: string;
  maxMainServers: number;
  maxLoadBalancers: number;
  maxServers: number;
  allPlugins: boolean;
};

const LIMITS_BY_SLUG: Record<string, PlanLimits> = {
  trial: {
    planSlug: "trial",
    maxMainServers: 1,
    maxLoadBalancers: 2,
    maxServers: 3,
    allPlugins: false,
  },
  starter: {
    planSlug: "starter",
    maxMainServers: 1,
    maxLoadBalancers: 2,
    maxServers: 3,
    allPlugins: false,
  },
  main: {
    planSlug: "main",
    maxMainServers: 1,
    maxLoadBalancers: 10,
    maxServers: 11,
    allPlugins: false,
  },
  "top-tier": {
    planSlug: "top-tier",
    maxMainServers: 1,
    maxLoadBalancers: 50,
    maxServers: 51,
    allPlugins: true,
  },
  top_tier: {
    planSlug: "top-tier",
    maxMainServers: 1,
    maxLoadBalancers: 50,
    maxServers: 51,
    allPlugins: true,
  },
};

const PLAN_LIMITS_KEY = "plan.limits";

function normalizeSlug(raw: string): string {
  return raw.toLowerCase().trim().replace(/_/g, "-");
}

export function limitsFromSlug(slug: string): PlanLimits {
  const key = normalizeSlug(slug);
  return (
    LIMITS_BY_SLUG[key] ??
    LIMITS_BY_SLUG.starter
  );
}

export function limitsFromMaxServers(maxServers: number): PlanLimits {
  const main = 1;
  const lb = Math.max(0, maxServers - main);
  return {
    planSlug: "custom",
    maxMainServers: main,
    maxLoadBalancers: lb,
    maxServers,
    allPlugins: maxServers >= 51,
  };
}

export async function storePlanLimits(limits: PlanLimits): Promise<void> {
  await prisma.panelSetting.upsert({
    where: { key: PLAN_LIMITS_KEY },
    create: { key: PLAN_LIMITS_KEY, value: JSON.stringify(limits) },
    update: { value: JSON.stringify(limits) },
  });
}

export async function getPlanLimits(panelHost?: string): Promise<PlanLimits> {
  if (panelHost && isPanelDemoHost(panelHost)) {
    return { ...LIMITS_BY_SLUG.starter, planSlug: "demo" };
  }

  const row = await prisma.panelSetting.findUnique({ where: { key: PLAN_LIMITS_KEY } });
  if (row?.value) {
    try {
      return JSON.parse(row.value) as PlanLimits;
    } catch {
      /* fall through */
    }
  }

  const stored = await getStoredLicense();
  if (stored?.tier) {
    return limitsFromSlug(stored.tier);
  }

  return LIMITS_BY_SLUG.starter;
}

export async function assertCanCreateMainServer(): Promise<string | null> {
  const limits = await getPlanLimits();
  const count = await prisma.streamServer.count();
  if (count >= limits.maxMainServers) {
    return `Plan limit reached: ${limits.maxMainServers} main panel server(s). Upgrade your license.`;
  }
  return null;
}

export async function assertCanCreateLoadBalancer(): Promise<string | null> {
  const limits = await getPlanLimits();
  const count = await prisma.streamProxy.count();
  if (count >= limits.maxLoadBalancers) {
    return `Plan limit reached: ${limits.maxLoadBalancers} load balancer(s). Upgrade your license.`;
  }
  return null;
}
