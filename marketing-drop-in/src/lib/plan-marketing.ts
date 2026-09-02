import {
  PAID_PLAN_SLUG,
  PAID_PRICE_GBP_CENTS,
  TRIAL_PLAN_SLUG,
  UNLIMITED_SERVERS,
  type PlanView,
} from "@/lib/plans";
import { isFreePeriod } from "@/lib/marketing-coupon";
import { pricingHonestyNote, paidPlanLimitNote } from "@/lib/marketing-copy";

export type PlanMarketing = {
  planLimits: string[];
  primaryLabel: string;
  primaryHref: string | null;
  primaryTrack: string;
  isTrial: boolean;
  highlight?: boolean;
};

export const FULL_PANEL_FEATURES = [
  "Back-office admin UI",
  "Reseller panel UI",
  "Xtream-compatible API",
  "Anti-Freeze playback & fast zapping",
  "Stripe & PayPal checkout",
  "Sub-reseller hierarchy & credits",
  "Commission & usage reports",
  "Geo-blocking, leak audit & VOD workspace",
  "White-label branding & outbound webhooks",
  "Telegram alerts (when configured)",
  "All media & music plugins included",
  "Unlimited stream servers",
  "No subscriber line cap in panel software",
] as const;

export const PRICING_HONESTY_NOTE = pricingHonestyNote();

export function isTrialPlan(plan: PlanView): boolean {
  return (
    plan.slug === TRIAL_PLAN_SLUG ||
    plan.slug.includes("trial") ||
    plan.name.toLowerCase().includes("trial")
  );
}

function isUnlimitedServers(plan: PlanView): boolean {
  return plan.maxServers >= UNLIMITED_SERVERS;
}

function serversLimitLabel(plan: PlanView): string {
  if (isUnlimitedServers(plan)) return "Unlimited stream servers";
  return `${plan.maxServers} stream server${plan.maxServers === 1 ? "" : "s"}`;
}

function planLimitsFor(plan: PlanView): string[] {
  if (isTrialPlan(plan)) {
    return [
      "7-day full panel license",
      serversLimitLabel(plan),
      "All media & music plugins included",
      "Every panel feature — same as paid plan",
      "One trial per account · no card required",
    ];
  }

  return [
    serversLimitLabel(plan),
    "All media & music plugins included",
    "Every Nexlify panel feature included",
    "Stripe or PayPal checkout",
    paidPlanLimitNote(),
  ];
}

export function getPlanMarketing(plan: PlanView): PlanMarketing {
  const trial = isTrialPlan(plan);

  if (trial) {
    return {
      planLimits: planLimitsFor(plan),
      primaryLabel: "Start free trial",
      primaryHref: "/register?trial=1",
      primaryTrack: "trial_start",
      isTrial: true,
    };
  }

  return {
    planLimits: planLimitsFor(plan),
    primaryLabel:
      plan.priceCents === 0 || isFreePeriod() ? "Get free license" : "Buy license",
    primaryHref: null,
    primaryTrack: "checkout_start",
    isTrial: false,
    highlight: plan.slug === PAID_PLAN_SLUG,
  };
}

export function formatPlanPrice(plan: PlanView, formatted: string): string {
  if (plan.priceCents === 0 || isFreePeriod()) return "Free";
  return formatted;
}

export function postPromoPriceLabel(): string {
  return `Then £${PAID_PRICE_GBP_CENTS / 100}/month`;
}
