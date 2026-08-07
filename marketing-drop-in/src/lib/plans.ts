import { GBP_TO_USD_RATE } from "@/lib/marketing-constants";

export const TRIAL_PLAN_SLUG = "trial";
export const PAID_PLAN_SLUG = "nexlify";
export const PAID_PRICE_GBP_CENTS = 5000;
/** License-enforced server cap — panel treats >= 51 as all plugins; 9999 = unlimited in UI. */
export const UNLIMITED_SERVERS = 9999;

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

const TRIAL_FALLBACK: PlanView = {
  id: "fallback-trial",
  name: "7-Day Trial",
  slug: TRIAL_PLAN_SLUG,
  description: "Full panel for 7 days — unlimited servers, all plugins, every feature. No card required.",
  priceCents: 0,
  durationDays: 7,
  maxLines: 100000,
  maxServers: UNLIMITED_SERVERS,
  badge: "trial",
  features: [],
  whmcsProductId: null,
};

const PAID_FALLBACK: PlanView = {
  id: "fallback-nexlify",
  name: "Nexlify License",
  slug: PAID_PLAN_SLUG,
  description: "One simple plan — unlimited stream servers, all media & music plugins, every panel feature included.",
  priceCents: PAID_PRICE_GBP_CENTS,
  durationDays: 30,
  maxLines: 100000,
  maxServers: UNLIMITED_SERVERS,
  badge: null,
  features: [],
  whmcsProductId: 1,
};

/** Fallback when the database is unavailable (GBP cents). */
export const FALLBACK_PLANS: PlanView[] = [TRIAL_FALLBACK, PAID_FALLBACK];

export function isTrialSlug(slug: string): boolean {
  return slug === TRIAL_PLAN_SLUG || slug.includes("trial");
}

export function isPaidSlug(slug: string): boolean {
  return slug === PAID_PLAN_SLUG;
}

/** Show trial + single paid plan only (hide legacy starter/main/top-tier). */
export function plansForPricing(plans: PlanView[]): PlanView[] {
  const trial = plans.find((p) => isTrialSlug(p.slug));
  const paid =
    plans.find((p) => isPaidSlug(p.slug)) ??
    plans.find((p) => !isTrialSlug(p.slug) && p.priceCents > 0);

  const picked = [trial, paid].filter(Boolean) as PlanView[];
  if (picked.length >= 2) return picked;
  if (picked.length === 1 && isTrialSlug(picked[0]!.slug)) return [picked[0]!, PAID_FALLBACK];
  if (picked.length === 1) return [TRIAL_FALLBACK, picked[0]!];
  return FALLBACK_PLANS;
}

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
  active?: boolean;
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
