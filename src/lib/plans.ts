import { GBP_TO_USD_RATE } from "@/lib/marketing-constants";

export const TRIAL_PLAN_SLUG = "trial";

export type PlanView = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  durationDays: number;
  maxLines: number;
  maxServers: number;
  badge: string | null;
  features: string[];
  whmcsProductId: number | null;
};

/** Fallback tiers when the database is unavailable (GBP cents). */
export const FALLBACK_PLANS: PlanView[] = [
  {
    id: "fallback-trial",
    name: "7-Day Trial",
    slug: TRIAL_PLAN_SLUG,
    description: "Same full panel as paid tiers — 7 days, 3 servers, no card required.",
    priceCents: 0,
    durationDays: 7,
    maxLines: 10000,
    maxServers: 3,
    badge: "trial",
    features: [],
    whmcsProductId: null,
  },
  {
    id: "fallback-starter",
    name: "Starter",
    slug: "starter",
    description: "Full Nexlify panel with entry server capacity. Plugins sold separately.",
    priceCents: 0,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 3,
    badge: "starter",
    features: [],
    whmcsProductId: 1,
  },
  {
    id: "fallback-main",
    name: "Main",
    slug: "main",
    description: "Full panel for growing operators — more stream servers, same software.",
    priceCents: 0,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 11,
    badge: "popular",
    features: [],
    whmcsProductId: 2,
  },
  {
    id: "fallback-top-tier",
    name: "Top Tier",
    slug: "top-tier",
    description: "Maximum servers plus all media & music plugins included in the license.",
    priceCents: 0,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 51,
    badge: "new",
    features: [],
    whmcsProductId: 3,
  },
];

export function gbpToUsdCents(gbpCents: number): number {
  return Math.round(gbpCents * GBP_TO_USD_RATE);
}

export function toPlanView(plan: {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  durationDays: number;
  maxLines: number;
  maxServers: number;
  badge: string | null;
  featuresJson: string | null;
  whmcsProductId: number | null;
}): PlanView {
  let features: string[] = [];
  if (plan.featuresJson) {
    try {
      const parsed = JSON.parse(plan.featuresJson) as unknown;
      if (Array.isArray(parsed)) {
        features = parsed.filter((f): f is string => typeof f === "string");
      }
    } catch {
      features = [];
    }
  }

  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    priceCents: plan.priceCents,
    durationDays: plan.durationDays,
    maxLines: plan.maxLines,
    maxServers: plan.maxServers,
    badge: plan.badge,
    features,
    whmcsProductId: plan.whmcsProductId,
  };
}
