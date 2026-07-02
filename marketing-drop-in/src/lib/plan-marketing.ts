import { TRIAL_PLAN_SLUG, type PlanView } from "@/lib/plans";

export type PlanMarketing = {
  /** What differs on this plan (enforced by license). */
  planLimits: string[];
  primaryLabel: string;
  primaryHref: string | null;
  primaryTrack: string;
  isTrial: boolean;
  hideWhmcs: boolean;
  highlight?: boolean;
};

/** Shown on every card — all tiers run the same panel codebase. */
export const FULL_PANEL_FEATURES = [
  "Back-office admin UI",
  "Reseller panel UI",
  "Xtream-compatible API",
  "Anti-Freeze playback & fast zapping",
  "WHMCS / Stripe license provisioning",
  "Sub-reseller hierarchy & credits",
  "Commission & usage reports",
  "Geo-blocking, leak audit & VOD workspace",
  "White-label branding & outbound webhooks",
  "Telegram alerts (when configured)",
  "No subscriber line cap in panel software",
] as const;

export const PRICING_HONESTY_NOTE =
  "Every tier runs the same Nexlify panel. Your license enforces stream-server count and plugin access only. Support is via tickets and Telegram — response times are not tier-gated in software.";

export function isTrialPlan(plan: PlanView): boolean {
  return (
    plan.slug === TRIAL_PLAN_SLUG ||
    plan.slug.includes("trial") ||
    plan.name.toLowerCase().includes("trial")
  );
}

function isTopTier(plan: PlanView): boolean {
  return plan.slug.includes("top") || plan.name.toLowerCase().includes("top tier");
}

function serversLimitLabel(plan: PlanView): string {
  const n = plan.maxServers;
  return `${n} stream server${n === 1 ? "" : "s"} (enforced by license)`;
}

function planLimitsFor(plan: PlanView): string[] {
  if (isTrialPlan(plan)) {
    return [
      "7-day panel license",
      serversLimitLabel(plan),
      "Full panel software — same as paid tiers",
      "Plugin add-ons not included on trial",
      "One trial per account · no card required",
    ];
  }

  if (isTopTier(plan)) {
    return [
      serversLimitLabel(plan),
      "All media & music plugins included",
      "Highest server capacity",
    ];
  }

  const key = plan.slug.includes("main") || plan.slug.includes("pro") ? "main" : "starter";
  const label = key === "main" ? "Mid-scale server capacity" : "Entry server capacity";

  return [
    serversLimitLabel(plan),
    label,
    "Plugin add-ons available separately (or upgrade to Top Tier)",
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
      hideWhmcs: true,
    };
  }

  return {
    planLimits: planLimitsFor(plan),
    primaryLabel: plan.priceCents === 0 ? "Get free license" : "Buy license",
    primaryHref: null,
    primaryTrack: "checkout_start",
    isTrial: false,
    hideWhmcs: true,
    highlight: plan.badge?.toLowerCase() === "popular",
  };
}

export function formatPlanPrice(plan: PlanView, formatted: string): string {
  if (plan.priceCents === 0) return "Free";
  return formatted;
}
