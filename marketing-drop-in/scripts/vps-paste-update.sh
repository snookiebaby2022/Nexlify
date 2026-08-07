#!/usr/bin/env bash
# Nexlify marketing — paste-and-run VPS update (no GitHub, no WinSCP).
# Copy this ENTIRE output and paste into PuTTY, OR run: bash vps-paste-update.sh

set -u
MARKETING="/var/www/nexlify"
echo "=== Nexlify marketing update ==="

for P in /home/nexlify-panel /opt/nexlify-panel; do
  if [ -d "$P/marketing-drop-in/src" ]; then
    echo "-> Syncing from $P/marketing-drop-in ..."
    rsync -a --exclude node_modules --exclude .next --exclude .env --exclude src/generated \
      "$P/marketing-drop-in/" "$MARKETING/"
    break
  fi
done

mkdir -p "$MARKETING/src/lib" "$MARKETING/src/components" "$MARKETING/src/app/pricing" \
  "$MARKETING/src/app/api/checkout" "$MARKETING/src/app/api/auth" "$MARKETING/src/app/api/admin/licenses" \
  "$MARKETING/scripts" "$MARKETING/.license-keys"

echo "-> Writing latest source files..."

cat > "$MARKETING/src/lib/plans.ts" << 'FILE_src_lib_plans_ts'
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

FILE_src_lib_plans_ts

cat > "$MARKETING/src/lib/plan-marketing.ts" << 'FILE_src_lib_plan_marketing_ts'
import {
  PAID_PLAN_SLUG,
  PAID_PRICE_GBP_CENTS,
  TRIAL_PLAN_SLUG,
  UNLIMITED_SERVERS,
  type PlanView,
} from "@/lib/plans";
import { isFreePeriod, FREE_PERIOD_END_LABEL } from "@/lib/marketing-coupon";

export type PlanMarketing = {
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
  "All media & music plugins included",
  "Unlimited stream servers",
  "No subscriber line cap in panel software",
] as const;

export const PRICING_HONESTY_NOTE = `One plan at £${PAID_PRICE_GBP_CENTS / 100}/month after ${FREE_PERIOD_END_LABEL} — everything included. Support via tickets and Telegram.`;

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
    "WHMCS IPTV module included",
    `£${PAID_PRICE_GBP_CENTS / 100}/month after free period`,
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
    primaryLabel:
      plan.priceCents === 0 || isFreePeriod() ? "Get free license" : "Buy license",
    primaryHref: null,
    primaryTrack: "checkout_start",
    isTrial: false,
    hideWhmcs: true,
    highlight: plan.slug === PAID_PLAN_SLUG,
  };
}

export function formatPlanPrice(plan: PlanView, formatted: string): string {
  if (isTrialPlan(plan)) return "Free";
  if (plan.priceCents === 0 || isFreePeriod()) return "Free";
  return formatted;
}

export function postPromoPriceLabel(): string {
  return `£${PAID_PRICE_GBP_CENTS / 100}/month after ${FREE_PERIOD_END_LABEL}`;
}

FILE_src_lib_plan_marketing_ts

cat > "$MARKETING/src/lib/marketing-coupon.ts" << 'FILE_src_lib_marketing_coupon_ts'
export const NEXLIFY_LAUNCH_COUPON = "NEXLIFY50";
export const COUPON_DISMISS_KEY = "nexlify_coupon_dismissed";
export const PENDING_COUPON_KEY = "nexlify_pending_coupon";

export const PANEL_COUPON_API =
  process.env.NEXT_PUBLIC_PANEL_URL?.replace(/\/+$/, "") ??
  "https://panel.nexlify.live";

/** Free launch period: all licenses are free until 2026-09-01 00:00:00 UTC */
export const FREE_PERIOD_END = new Date("2026-09-01T00:00:00Z");

/** Human-readable end date for marketing copy */
export const FREE_PERIOD_END_LABEL = "September 1, 2026";

export function isFreePeriod(): boolean {
  return new Date() < FREE_PERIOD_END;
}

export function daysUntilFreePeriodEnds(): number {
  const now = new Date();
  if (now >= FREE_PERIOD_END) return 0;
  return Math.ceil((FREE_PERIOD_END.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export type PanelCouponView = {
  code: string;
  label: string | null;
  percentOff: number;
  discountMonths: number | null;
  maxRedemptions: number;
  redemptionCount: number;
  remaining: number | null;
  active: boolean;
  expired: boolean;
  soldOut: boolean;
};

export function readPendingCouponCode(): string | null {
  if (typeof window === "undefined") return null;
  const code = sessionStorage.getItem(PENDING_COUPON_KEY)?.trim().toUpperCase();
  return code || null;
}

export function storePendingCoupon(code: string = NEXLIFY_LAUNCH_COUPON) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_COUPON_KEY, code.trim().toUpperCase());
  sessionStorage.setItem(COUPON_DISMISS_KEY, "1");
}

export async function fetchPanelCoupon(
  code: string = NEXLIFY_LAUNCH_COUPON,
): Promise<PanelCouponView | null> {
  const res = await fetch(
    `${PANEL_COUPON_API}/api/billing/coupon?code=${encodeURIComponent(code)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.coupon ?? null;
}

export function couponCheckoutTotals(
  priceCents: number,
  durationDays: number,
  coupon: Pick<PanelCouponView, "percentOff" | "discountMonths">,
) {
  const months = Math.max(1, coupon.discountMonths ?? 1);
  const licenseDurationDays = durationDays * months;
  const fullPriceCents = priceCents * months;
  const amountCents = Math.round(fullPriceCents * (1 - coupon.percentOff / 100));
  return { amountCents, licenseDurationDays, months };
}

FILE_src_lib_marketing_coupon_ts

cat > "$MARKETING/src/lib/license.ts" << 'FILE_src_lib_license_ts'
import { createPrivateKey, sign } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function durationDaysToTerm(days: number): string {
  if (days <= 0 || days >= 36500) return "unlimited";
  if (days <= 35) return "1m";
  if (days <= 100) return "3m";
  if (days <= 200) return "6m";
  return "1y";
}

function getTermDays(term: string): number {
  switch (term) {
    case "1m": return 30;
    case "3m": return 90;
    case "6m": return 180;
    case "1y": return 365;
    case "unlimited": return 36500;
    default: return 30;
  }
}

function loadPrivateKeyPem(): string {
  const fromEnv = process.env.LICENSE_SERVER_PRIVATE_PEM?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    process.env.LICENSE_KEY_FILE?.trim(),
    join(process.cwd(), ".license-keys", "private.pem"),
    "/var/www/nexlify/.license-keys/private.pem",
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8").trim();
    } catch {
      /* try next path */
    }
  }

  throw new Error(
    "Missing license signing key — set LICENSE_SERVER_PRIVATE_PEM, LICENSE_KEY_FILE, or .license-keys/private.pem",
  );
}

function loadPrivateKey() {
  return createPrivateKey(loadPrivateKeyPem());
}

function signPayload(payload: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const priv = loadPrivateKey();
  const sig = sign(null, Buffer.from(payloadB64), priv);
  return `NXLF1.${payloadB64}.${sig.toString("base64url")}`;
}

/** Generate a signed NXLF1 license key locally (no license server needed). */
export async function requestLicenseKey(opts: {
  email: string;
  durationDays?: number;
  term?: string;
}): Promise<string> {
  const term =
    opts.term?.trim() ||
    durationDaysToTerm(opts.durationDays ?? 365);
  const termDays = getTermDays(term);
  const exp = Math.floor(Date.now() / 1000) + termDays * 86400;
  const lid = `NX-${Date.now().toString(36)}`;

  const payload = {
    v: 1,
    lid,
    sub: opts.email,
    exp,
    term,
    tier: term === "unlimited" ? "unlimited" : "1y",
    iat: Math.floor(Date.now() / 1000),
    iid: "BIND_ON_ACTIVATE",
  };

  return signPayload(payload);
}

/** @deprecated Use requestLicenseKey */
export async function generateLicenseKey(email: string, durationDays: number): Promise<string> {
  return requestLicenseKey({ email, durationDays });
}

export async function uniqueLicenseKey(
  email: string,
  durationDays: number,
  term?: string
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = await requestLicenseKey({ email, durationDays, term });
    const existing = await prisma.license.findUnique({ where: { key } });
    if (!existing) return key;
  }
  throw new Error("Failed to generate a unique license key");
}

FILE_src_lib_license_ts

cat > "$MARKETING/src/components/IncludedFeaturesSection.tsx" << 'FILE_src_components_IncludedFeaturesSection_tsx'
import Link from "next/link";
import { FULL_PANEL_FEATURES } from "@/lib/plan-marketing";

export function IncludedFeaturesSection() {
  return (
    <section className="border-t border-white/10 bg-[#0a0814] py-16 md:py-20">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <h2 className="font-display text-2xl font-bold text-white">Everything included</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--muted)]">
          One license — unlimited stream servers, all media & music plugins, and the full Nexlify
          panel. No tier upgrades or add-on packs required.
        </p>
        <ul className="mx-auto mt-10 grid max-w-2xl gap-2 text-left text-sm text-slate-300 sm:grid-cols-2">
          {FULL_PANEL_FEATURES.map((feature) => (
            <li key={feature} className="flex gap-2 leading-snug">
              <span className="shrink-0 text-emerald-400/90" aria-hidden>
                ✓
              </span>
              {feature}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-[var(--muted)]">
          Questions?{" "}
          <Link href="/support" className="text-violet-400 hover:text-violet-300 underline">
            Open a support ticket
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

FILE_src_components_IncludedFeaturesSection_tsx

cat > "$MARKETING/src/components/FreeLaunchBanner.tsx" << 'FILE_src_components_FreeLaunchBanner_tsx'
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  daysUntilFreePeriodEnds,
  FREE_PERIOD_END_LABEL,
  isFreePeriod,
} from "@/lib/marketing-coupon";

const FREE_BANNER_KEY = "nexlify_free_banner_dismissed";

export function FreeLaunchBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isFreePeriod()) return;
    if (localStorage.getItem(FREE_BANNER_KEY) === "1") return;
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(FREE_BANNER_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const daysLeft = daysUntilFreePeriodEnds();

  return (
    <div
      className="fixed inset-x-0 top-0 z-[70] border-b border-amber-500/40 bg-gradient-to-r from-amber-950 via-[#1a0f00] to-orange-950 shadow-lg shadow-black/40"
      role="region"
      aria-label="Free launch promotion"
      data-nx-free-banner
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2.5">
        <div className="min-w-0 flex-1 pr-8 sm:pr-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Limited Time
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/80">
              {daysLeft > 0 ? `${daysLeft} days left` : "Ends today"}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-white sm:text-base">
            <span className="font-bold text-amber-300">All licenses are free</span> until{" "}
            <span className="text-amber-200">{FREE_PERIOD_END_LABEL}</span> — no coupon needed
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/pricing"
            onClick={() => trackEvent("free_banner_click", { page: "global" })}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 transition-all"
          >
            Claim free license →
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Dismiss promotion"
          >
            <span className="text-xl leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

FILE_src_components_FreeLaunchBanner_tsx

cat > "$MARKETING/src/components/PricingSection.tsx" << 'FILE_src_components_PricingSection_tsx'
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { FREE_PERIOD_END_LABEL, isFreePeriod, readPendingCouponCode } from "@/lib/marketing-coupon";
import { formatPlanPrice, getPlanMarketing, isTrialPlan, PRICING_HONESTY_NOTE, FULL_PANEL_FEATURES, postPromoPriceLabel } from "@/lib/plan-marketing";
import { FALLBACK_PLANS, gbpToUsdCents, type PlanView } from "@/lib/plans";

type Currency = "GBP" | "USD";

type PricingSectionProps = {
  plans: PlanView[];
  loggedIn: boolean;
  stripeEnabled: boolean;
  whmcsCartBaseUrl: string | null;
};

function displayPriceCents(plan: PlanView, currency: Currency): number {
  return currency === "GBP" ? plan.priceCents : gbpToUsdCents(plan.priceCents);
}

export function PricingSection({
  plans,
  loggedIn,
  stripeEnabled,
  whmcsCartBaseUrl,
}: PricingSectionProps) {
  const router = useRouter();
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tiers = plans.length > 0 ? plans : FALLBACK_PLANS;
  const gridCols =
    tiers.length >= 4
      ? "md:grid-cols-2 xl:grid-cols-4"
      : tiers.length === 3
        ? "md:grid-cols-3"
        : "md:grid-cols-2";

  async function buy(plan: PlanView) {
    if (!loggedIn) {
      const next = encodeURIComponent("/pricing");
      window.location.href = isTrialPlan(plan)
        ? `/register?trial=1`
        : `/login?next=${next}`;
      return;
    }
    // During free period, all plans are free — bypass stripe check
    if (plan.priceCents > 0 && !stripeEnabled && !isFreePeriod()) {
      setError("Stripe checkout is not configured — use WHMCS or contact support.");
      return;
    }
    setLoadingId(plan.id);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          couponCode: readPendingCouponCode() ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.redirect) {
        router.push(data.redirect.replace(/^https?:\/\/[^/]+/, "") || "/dashboard");
        return;
      }
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoadingId(null);
    }
  }

  function whmcsHref(plan: PlanView): string | null {
    if (!whmcsCartBaseUrl || !plan.whmcsProductId) return null;
    const base = whmcsCartBaseUrl.replace(/\/$/, "");
    return `${base}?a=add&pid=${plan.whmcsProductId}`;
  }

  return (
    <section className="py-16 md:py-24" id="pricing">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-[var(--muted)]">
            <span className="text-amber-300 font-semibold">Free until {FREE_PERIOD_END_LABEL}</span> · instant digital delivery · no hidden fees
          </p>
          <div
            className="inline-flex rounded-full border border-white/15 p-1"
            role="group"
            aria-label="Currency"
          >
            {(["GBP", "USD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors min-h-[44px] ${
                  currency === c
                    ? "bg-violet-600 text-white"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Limited Time
            </span>
            <span className="text-xs font-semibold text-amber-200/80">
              All licenses free until {FREE_PERIOD_END_LABEL} — no coupon needed
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Plans differ by <strong className="text-slate-300">trial vs paid license</strong> only — both
            include <strong className="text-slate-300">unlimited servers</strong> and{" "}
            <strong className="text-slate-300">all plugins</strong>.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 text-sm text-slate-300">
            {FULL_PANEL_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2 leading-snug">
                <span className="shrink-0 text-emerald-400/90" aria-hidden>
                  ✓
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className={`mt-10 grid gap-6 ${gridCols}`}>
          {tiers.map((plan) => {
            const marketing = getPlanMarketing(plan);
            const price = displayPriceCents(plan, currency);
            const whmcs = marketing.hideWhmcs ? null : whmcsHref(plan);
            const priceDisplay = formatPlanPrice(plan, formatMoney(price, currency));

            return (
              <div
                key={plan.id}
                className={`glass relative flex flex-col rounded-2xl p-6 transition-shadow ${
                  marketing.highlight || plan.badge
                    ? "border-violet-500/50 shadow-lg shadow-violet-500/10"
                    : marketing.isTrial
                      ? "border-emerald-500/30"
                      : ""
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                    {plan.badge}
                  </span>
                )}
                <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
                <p className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-[var(--muted)]">
                  {plan.description}
                </p>
                <p className="font-display mt-6 text-3xl font-bold text-white sm:text-4xl">
                  {priceDisplay}
                  {!marketing.isTrial && plan.priceCents > 0 && (
                    <span className="text-base font-normal text-[var(--muted)]">/mo</span>
                  )}
                  {marketing.isTrial && (
                    <span className="text-base font-normal text-emerald-400/90"> · 7 days</span>
                  )}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-violet-300/90">
                  This plan includes
                </p>
                <ul className="mt-3 flex-1 space-y-2.5 text-sm text-slate-300">
                  {marketing.planLimits.map((feature) => (
                    <li key={feature} className="flex gap-2 leading-snug">
                      <span className="mt-0.5 shrink-0 text-amber-400" aria-hidden>
                        ●
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 space-y-2">
                  {loggedIn || !marketing.primaryHref ? (
                    <button
                      type="button"
                      onClick={() => buy(plan)}
                      disabled={loadingId === plan.id || plan.id.startsWith("fallback-")}
                      data-track={marketing.primaryTrack}
                      data-track-label={`pricing_${plan.slug}`}
                      className={`w-full min-h-[44px] rounded-full py-3 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50 transition-all ${
                        marketing.isTrial
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20"
                          : "bg-gradient-to-r from-amber-500 to-orange-500"
                      }`}
                    >
                      {loadingId === plan.id ? "Redirecting…" : marketing.primaryLabel}
                    </button>
                  ) : (
                    <Link
                      href={marketing.primaryHref}
                      data-track={marketing.primaryTrack}
                      data-track-label={`pricing_${plan.slug}`}
                      className="block w-full min-h-[44px] rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-center text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 transition-all"
                    >
                      {marketing.primaryLabel}
                    </Link>
                  )}
                  {whmcs && (
                    <a
                      href={whmcs}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full min-h-[44px] rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-slate-200 hover:border-violet-400/40 transition-colors"
                    >
                      Checkout via WHMCS
                    </a>
                  )}
                  {marketing.isTrial && (
                    <p className="text-center text-xs text-[var(--muted)]">
                      No card · Upgrade anytime
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 max-w-3xl mx-auto text-center text-xs leading-relaxed text-[var(--muted)]">
          {PRICING_HONESTY_NOTE}
        </p>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Not sure yet?{" "}
          <Link href="/demo" className="font-semibold text-violet-400 hover:text-violet-300 underline">
            Explore the live demo
          </Link>
          {" · "}
          <span className="text-amber-300/90">{postPromoPriceLabel()} · unlimited servers included</span>
        </p>

        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          No credit card required during the free period — licenses are delivered instantly.
        </p>

        {error && (
          <div
            className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>
    </section>
  );
}

FILE_src_components_PricingSection_tsx

cat > "$MARKETING/src/components/LegacyPanelPricingCompare.tsx" << 'FILE_src_components_LegacyPanelPricingCompare_tsx'
import Link from "next/link";

type CompareCell = boolean | "partial" | string;

type Row = {
  feature: string;
  nexlify: CompareCell;
  xui: CompareCell;
  oneStream: CompareCell;
};

const ROWS: Row[] = [
  {
    feature: "License from",
    nexlify: "£50/mo (all inclusive)",
    xui: "Varies / community forks",
    oneStream: "Fork-dependent",
  },
  {
    feature: "WHMCS IPTV module",
    nexlify: true,
    xui: "partial",
    oneStream: false,
  },
  {
    feature: "IPTV management software stack",
    nexlify: "Node + PostgreSQL",
    xui: "Legacy PHP",
    oneStream: "Varies by fork",
  },
  {
    feature: "Built-in XUI / 1-stream migration",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
  {
    feature: "Preview import (dry-run)",
    nexlify: true,
    xui: false,
    oneStream: "partial",
  },
  {
    feature: "7-day free trial",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
  {
    feature: "GBP + USD checkout",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
  {
    feature: "In-panel support tickets",
    nexlify: true,
    xui: "partial",
    oneStream: "partial",
  },
  {
    feature: "Anti-freeze playback",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
];

function cellLabel(value: CompareCell): string {
  if (value === true) return "✓";
  if (value === false) return "—";
  if (value === "partial") return "~";
  return value;
}

function cellClass(value: CompareCell): string {
  if (value === true) return "text-emerald-300/90 font-medium";
  if (value === "partial") return "text-amber-300/80";
  return "text-[var(--muted)]";
}

export function LegacyPanelPricingCompare() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-12" aria-labelledby="legacy-panel-compare-heading">
      <h2 id="legacy-panel-compare-heading" className="font-display text-center text-2xl font-bold text-white md:text-3xl">
        Nexlify vs XUI.one vs 1-stream
      </h2>
      <p className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-[var(--muted)] md:text-base">
        Operators searching for an <strong className="text-slate-300">IPTV reseller panel</strong> often compare
        Nexlify against legacy XUI.one forks and 1-stream stacks. Every Nexlify license includes the{" "}
        <strong className="text-slate-300">WHMCS IPTV module</strong> and full{" "}
        <strong className="text-slate-300">IPTV management software</strong> — not a bolt-on script bundle.
        Third-party names are used descriptively only.
      </p>

      <div className="-mx-4 mt-10 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04]">
          <table className="w-full min-w-[min(100%,560px)] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-3.5 font-semibold text-white sm:px-4">What operators compare</th>
                <th className="px-3 py-3.5 font-semibold text-violet-300 sm:px-4">Nexlify</th>
                <th className="px-3 py-3.5 font-semibold text-[var(--muted)] sm:px-4">XUI.one</th>
                <th className="px-3 py-3.5 font-semibold text-[var(--muted)] sm:px-4">1-stream</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-3 font-medium text-slate-200 sm:px-4">{row.feature}</td>
                  <td className={`px-3 py-3 sm:px-4 ${cellClass(row.nexlify)}`}>{cellLabel(row.nexlify)}</td>
                  <td className={`px-3 py-3 sm:px-4 ${cellClass(row.xui)}`}>{cellLabel(row.xui)}</td>
                  <td className={`px-3 py-3 sm:px-4 ${cellClass(row.oneStream)}`}>
                    {cellLabel(row.oneStream)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-center text-xs text-[var(--muted)] sm:hidden">Swipe to compare columns</p>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        ✓ included · ~ partial or add-on · — not typical
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm">
        <Link href="/vs/xui-one" className="text-violet-400 hover:text-violet-300 underline">
          Full Nexlify vs XUI.one comparison
        </Link>
        <Link href="/vs/1-stream" className="text-violet-400 hover:text-violet-300 underline">
          Full Nexlify vs 1-stream comparison
        </Link>
        <Link href="/blog/migrate-from-xui-or-1-stream" className="text-violet-400 hover:text-violet-300 underline">
          Migration checklist
        </Link>
      </div>
    </section>
  );
}

FILE_src_components_LegacyPanelPricingCompare_tsx

cat > "$MARKETING/src/components/Hero.tsx" << 'FILE_src_components_Hero_tsx'
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { SOFTWARE_POSITIONING } from "@/lib/marketing-constants";
import { FREE_PERIOD_END_LABEL, isFreePeriod } from "@/lib/marketing-coupon";
import { site } from "@/lib/site";

const HeroPanelCarousel = dynamic(
  () => import("@/components/HeroPanelCarousel").then((m) => ({ default: m.HeroPanelCarousel })),
  {
    loading: () => (
      <div
        className="skeleton-block min-h-[440px] w-full max-w-lg rounded-2xl lg:max-w-xl"
        aria-hidden
      />
    ),
    ssr: false,
  },
);

export function Hero() {
  return (
    <section className="relative overflow-hidden mesh-bg">
      <div className="pointer-events-none absolute inset-0 grid-pattern opacity-40" />

      <div className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl hero-orb" />
      <div className="pointer-events-none absolute -left-16 bottom-10 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl hero-orb" />
      <div className="pointer-events-none absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-cyan-500/8 blur-3xl hero-orb" />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-6 md:pb-32 md:pt-16 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:pt-20">
        <div className="order-1 min-h-[440px] lg:order-2">
          <HeroPanelCarousel />
        </div>

        <div className="order-2 mt-10 lg:order-1 lg:mt-0">
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 sm:px-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-composited-pulse" />
            IPTV reseller software · WHMCS billing · Live demo
          </div>

          {isFreePeriod() && (
            <p className="mt-4 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200">
              <span className="font-bold text-amber-300">All licenses free</span>
              until {FREE_PERIOD_END_LABEL} — no coupon needed
            </p>
          )}

          <h1 className="font-display mt-6 max-w-4xl text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
            IPTV reseller panel —{" "}
            <span className="text-gradient">management software</span> with live demo
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg lg:text-xl">
            {site.name} is {SOFTWARE_POSITIONING} for businesses worldwide. Start a free trial,
            explore the live demo, and deploy on your own VPS in one command.
          </p>

          <ContentDisclaimer className="mt-4 max-w-2xl" />

          <div className="mt-8">
            <TrialCtaButton trackLabel="hero_trial" />

            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
              <a
                href={DEMO_PANEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-track="demo_click"
                data-track-label="hero_demo"
                className="hover:text-violet-300 transition-colors"
              >
                Try live demo
              </a>
              <Link
                href="/pricing"
                data-track="checkout_start"
                data-track-label="hero_pricing"
                className="hover:text-violet-300 transition-colors"
              >
                View pricing
              </Link>
              <Link href="/install" className="hover:text-violet-300 transition-colors">
                Install panel
              </Link>
            </p>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {[
              { label: "AI Tools", value: "15 Built-in" },
              { label: "Features", value: "100+" },
              { label: "Zapping", value: "< 1s" },
              { label: "Billing", value: "WHMCS" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl px-4 py-4 sm:py-5">
                <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">{s.label}</dt>
                <dd className="font-display mt-1 text-base font-semibold text-white sm:text-lg">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

FILE_src_components_Hero_tsx

cat > "$MARKETING/src/app/pricing/page.tsx" << 'FILE_src_app_pricing_page_tsx'
import Link from "next/link";
import { Suspense } from "react";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { LegacyPanelPricingCompare } from "@/components/LegacyPanelPricingCompare";
import { PricingComparisonTable } from "@/components/PricingComparisonTable";
import { PageCta } from "@/components/PageCta";
import { PricingJsonLd } from "@/components/PricingJsonLd";
import { IncludedFeaturesSection } from "@/components/IncludedFeaturesSection";
import { PricingCheckoutLauncher } from "@/components/PricingCheckoutLauncher";
import { PricingSection } from "@/components/PricingSection";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { getSessionUser } from "@/lib/auth";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { toPlanView, plansForPricing } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";

import { pageSeo } from "@/lib/seo-pages";
import { FREE_PERIOD_END_LABEL } from "@/lib/marketing-coupon";

export const metadata = pageSeo("/pricing");



export default async function PricingPage() {
  const user = await getSessionUser();
  let plans: Awaited<ReturnType<typeof prisma.plan.findMany>> = [];
  try {
    plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch (error) {
    console.error("[pricing] database unavailable:", error);
  }

  const pricingPlans = plansForPricing(plans.map(toPlanView));

  return (
    <div className="mesh-bg">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ]}
      />
      <PricingJsonLd />
      <div className="mx-auto max-w-6xl px-4 pt-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
          Free until {FREE_PERIOD_END_LABEL}
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold text-white md:text-5xl">
          All licenses free — IPTV reseller panel for operators worldwide
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
          Nexlify IPTV management software is free for all operators until {FREE_PERIOD_END_LABEL}.
          Every license includes the WHMCS IPTV module, instant digital delivery, and full panel
          access — no credit card required during the free period.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <TrialCtaButton trackLabel="pricing_hero" loggedIn={Boolean(user)} />
          <p className="text-sm text-amber-300/90">
            <strong>Limited time:</strong> All plans are free — no coupon needed
          </p>
        </div>
        <PageCta
          className="mt-4"
          primary={{ label: "View plans below", href: "#license-tiers" }}
          secondary={[
            { label: "Try live demo", href: DEMO_PANEL_URL, external: true },
            { label: "WHMCS module docs", href: "/docs/whmcs" },
            { label: "All features", href: "/features" },
          ]}
        />
      </div>

      <section className="mx-auto max-w-4xl px-4 pb-10">
        <h2 className="font-display text-center text-2xl font-bold text-white">
          Why operators choose Nexlify IPTV reseller panel pricing
        </h2>
        <ul className="mx-auto mt-6 grid max-w-3xl gap-3 text-sm text-slate-300 sm:grid-cols-2">
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">WHMCS IPTV module included</strong> — auto-provision, renew,
              suspend on every plan
            </span>
          </li>
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">Anti-Freeze playback</strong> — reduce buffering complaints on
              residential lines
            </span>
          </li>
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">Built-in migration</strong> — preview import from XUI.one,
              1-stream, Xtream UI
            </span>
          </li>
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">Security stack</strong> — 2FA, geo-blocking, leak audit logs,
              token TTL
            </span>
          </li>
        </ul>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-8" id="license-tiers">
        <h2 className="font-display text-center text-2xl font-bold text-white">
          Simple pricing for service providers
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-[var(--muted)]">
          One license includes unlimited stream servers, all plugins, and the full Nexlify panel.
          Free until <strong className="text-amber-300">{FREE_PERIOD_END_LABEL}</strong>, then{" "}
          <strong className="text-amber-300">£50/month</strong>.
        </p>
        <h3 className="mt-8 text-center text-lg font-semibold text-violet-300">
          Currency and checkout options
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[var(--muted)]">
          Operators worldwide use the same Nexlify IPTV management software — choose GBP or USD at
          checkout. Questions?{" "}
          <Link href="/support" className="text-violet-400 hover:text-violet-300 underline">
            Open a support ticket
          </Link>
          .
        </p>
      </section>

      <LegacyPanelPricingCompare />

      <Suspense fallback={null}>
        <PricingCheckoutLauncher
          loggedIn={Boolean(user)}
          plans={pricingPlans.map((p) => ({ id: p.id, slug: p.slug }))}
        />
      </Suspense>

      <PricingComparisonTable />

      <PricingSection
        plans={pricingPlans}
        loggedIn={Boolean(user)}
        stripeEnabled={isStripeConfigured()}
        whmcsCartBaseUrl={process.env.NEXT_PUBLIC_WHMCS_URL ?? null}
      />
      <IncludedFeaturesSection />
    </div>
  );
}

FILE_src_app_pricing_page_tsx

cat > "$MARKETING/src/app/page.tsx" << 'FILE_src_app_page_tsx'
import { ComplianceSection } from "@/components/ComplianceSection";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoScreenshots } from "@/components/DemoScreenshots";
import { Features } from "@/components/Features";
import { TechStackSection } from "@/components/TechStackSection";
import { Hero } from "@/components/Hero";
import { HomeFaqJsonLd } from "@/components/HomeFaqJsonLd";
import { HomeNewsletterSignup, HomePricingSections } from "@/components/HomeBelowFold";
import { HomeSeoContent } from "@/components/HomeSeoContent";
import { SocialProofSection } from "@/components/SocialProofSection";
import { MigrationCtaSection } from "@/components/MigrationCtaSection";
import { WhatsNewSection } from "@/components/WhatsNewSection";
import { getSessionUser } from "@/lib/auth";
import { toPlanView, plansForPricing } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { pageSeo } from "@/lib/seo-pages";
import { isStripeConfigured } from "@/lib/stripe";

export const metadata = pageSeo("/");

export default async function HomePage() {
  const user = await getSessionUser();
  let plans: Awaited<ReturnType<typeof prisma.plan.findMany>> = [];
  try {
    plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch (error) {
    console.error("[home] database unavailable:", error);
  }

  const whmcsCartBaseUrl = process.env.NEXT_PUBLIC_WHMCS_URL ?? null;

  return (
    <>
      <HomeFaqJsonLd />
      <Hero />
      <WhatsNewSection />
      <SocialProofSection />
      <Features />
      <DemoScreenshots />
      <TechStackSection />
      <HomePricingSections
        plans={plansForPricing(plans.map(toPlanView))}
        loggedIn={Boolean(user)}
        stripeEnabled={isStripeConfigured()}
        whmcsCartBaseUrl={whmcsCartBaseUrl}
      />
      <MigrationCtaSection />
      <DemoBanner />
      <ComplianceSection />
      <HomeSeoContent />
      <section className="border-t border-white/10 bg-[#080612] py-16">
        <div className="mx-auto max-w-xl px-4 text-center">
          <h2 className="font-display text-xl font-semibold text-white">IPTV operator updates</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            worldwide release notes and reseller tips — no spam.
          </p>
          <div className="mt-6">
            <HomeNewsletterSignup />
          </div>
        </div>
      </section>
    </>
  );
}

FILE_src_app_page_tsx

cat > "$MARKETING/src/app/api/checkout/route.ts" << 'FILE_src_app_api_checkout_route_ts'
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { issueLicenseForOrder } from "@/lib/licensing";
import {
  couponCheckoutTotals,
  isFreePeriod,
  NEXLIFY_LAUNCH_COUPON,
  PANEL_COUPON_API,
  type PanelCouponView,
} from "@/lib/marketing-coupon";
import { prisma } from "@/lib/prisma";
import { TRIAL_PLAN_SLUG } from "@/lib/plans";
import { getAppUrl, getStripe, isStripeConfigured } from "@/lib/stripe";
import { issueTrialLicense } from "@/lib/trial";

const schema = z.object({
  planId: z.string().min(1),
  couponCode: z.string().trim().optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
});

async function validateCoupon(
  code: string,
  durationDays: number,
): Promise<PanelCouponView | null> {
  const res = await fetch(`${PANEL_COUPON_API}/api/billing/coupon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, days: durationDays }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.ok || !data?.coupon) return null;
  const coupon = data.coupon as PanelCouponView & { active?: boolean };
  if (coupon.active === false) return null;
  return coupon;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { planId, couponCode, utmSource, utmMedium, utmCampaign } =
      schema.parse(await request.json());
    const plan = await prisma.plan.findFirst({
      where: { id: planId, active: true },
    });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    let amountCents = plan.priceCents;
    let licenseDurationDays: number | null = null;
    let appliedCoupon: string | null = null;

    if (isFreePeriod() && plan.slug !== TRIAL_PLAN_SLUG) {
      amountCents = 0;
      licenseDurationDays = plan.durationDays;
    }

    const normalizedCoupon = couponCode?.trim().toUpperCase();
    if (normalizedCoupon) {
      const coupon = await validateCoupon(normalizedCoupon, plan.durationDays);
      if (!coupon) {
        return NextResponse.json({ error: "Invalid or expired coupon" }, { status: 400 });
      }
      const totals = couponCheckoutTotals(plan.priceCents, plan.durationDays, coupon);
      amountCents = totals.amountCents;
      licenseDurationDays = totals.licenseDurationDays;
      appliedCoupon = normalizedCoupon;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { utmSource: true, utmMedium: true, utmCampaign: true },
    });

    const utmFromUser =
      !utmSource && dbUser?.utmSource
        ? {
            utmSource: dbUser.utmSource,
            utmMedium: dbUser.utmMedium,
            utmCampaign: dbUser.utmCampaign,
          }
        : {};

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        planId: plan.id,
        amountCents,
        couponCode: appliedCoupon,
        licenseDurationDays,
        status: "PENDING",
        utmSource: utmSource?.trim() || utmFromUser.utmSource || null,
        utmMedium: utmMedium?.trim() || utmFromUser.utmMedium || null,
        utmCampaign: utmCampaign?.trim() || utmFromUser.utmCampaign || null,
      },
    });

    if (plan.slug === TRIAL_PLAN_SLUG) {
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      try {
        const license = await issueTrialLicense(user.id);
        return NextResponse.json({
          success: true,
          redirect: `${getAppUrl()}/dashboard`,
          licenseKey: license.key,
        });
      } catch (e) {
        const raw = e instanceof Error ? e.message : "Trial could not be started";
        const message = raw.includes("license signing key")
          ? "Trial setup failed: license signing key is not configured on the server. Contact support."
          : raw;
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (amountCents === 0) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "COMPLETED", amountCents: 0 },
      });
      await issueLicenseForOrder(order.id);
      return NextResponse.json({
        success: true,
        redirect: `${getAppUrl()}/checkout/success?order_id=${order.id}`,
      });
    }

    if (!isStripeConfigured()) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "COMPLETED" },
      });
      await issueLicenseForOrder(order.id);
      if (appliedCoupon === NEXLIFY_LAUNCH_COUPON) {
        await fetch(`${PANEL_COUPON_API}/api/billing/coupon`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-billing-secret": process.env.BILLING_WEBHOOK_SECRET ?? "",
          },
          body: JSON.stringify({ code: appliedCoupon }),
        }).catch(() => {});
      }
      return NextResponse.json({
        success: true,
        redirect: `${getAppUrl()}/checkout/success?order_id=${order.id}`,
      });
    }

    const stripe = getStripe();
    const description =
      appliedCoupon && licenseDurationDays
        ? `${plan.description} (${appliedCoupon}, ${licenseDurationDays} days)`
        : plan.description;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        plan.stripePriceId
          ? { price: plan.stripePriceId, quantity: 1 }
          : {
              price_data: {
                currency: "usd",
                unit_amount: amountCents,
                product_data: {
                  name: plan.name,
                  description,
                },
              },
              quantity: 1,
            },
      ],
      metadata: {
        orderId: order.id,
        userId: user.id,
        planId: plan.id,
        couponCode: appliedCoupon ?? "",
        licenseDurationDays: licenseDurationDays ? String(licenseDurationDays) : "",
      },
      success_url: `${getAppUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/pricing?canceled=1`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Checkout failed";
    console.error("[checkout]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

FILE_src_app_api_checkout_route_ts

cat > "$MARKETING/src/app/api/auth/register/route.ts" << 'FILE_src_app_api_auth_register_route_ts'
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { issueTrialLicense, trialLicensePayload } from "@/lib/trial";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  startTrial: z.boolean().optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  try {
    const body = schema.parse(await request.json());
    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        name: body.name ?? null,
        utmSource: body.utmSource?.trim() || null,
        utmMedium: body.utmMedium?.trim() || null,
        utmCampaign: body.utmCampaign?.trim() || null,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = await createSessionToken(user);
    await setSessionCookie(token);

    let trial = null;
    if (body.startTrial) {
      try {
        const license = await issueTrialLicense(user.id);
        trial = trialLicensePayload(license);
      } catch (e) {
        const raw = e instanceof Error ? e.message : "Trial could not be started";
        const message = raw.includes("license signing key")
          ? "Trial setup failed: license signing key is not configured on the server. Contact support."
          : raw;
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    return NextResponse.json({ user, trial });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}

FILE_src_app_api_auth_register_route_ts

cat > "$MARKETING/src/app/api/admin/licenses/route.ts" << 'FILE_src_app_api_admin_licenses_route_ts'
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { issueLicenseForOrder } from "@/lib/licensing";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const plan = searchParams.get("plan")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (plan) where.plan = { slug: plan };
  if (q) {
    where.OR = [
      { key: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const licenses = await prisma.license.findMany({
    where,
    include: {
      user: { select: { email: true, name: true } },
      plan: { select: { name: true, slug: true, priceCents: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    licenses: licenses.map((l) => ({
      id: l.id,
      key: l.key,
      status: l.status,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      maxLines: l.maxLines,
      notes: l.notes,
      machineId: l.machineId,
      panelUrl: l.panelUrl,
      lastSyncAt: l.lastSyncAt?.toISOString() ?? null,
      lastSyncError: l.lastSyncError,
      pendingSyncAction: l.pendingSyncAction,
      user: { email: l.user.email, name: l.user.name },
      plan: { name: l.plan.name, slug: l.plan.slug },
    })),
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (data.status) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.extendDays) {
      const lic = await prisma.license.findUnique({ where: { id } });
      if (!lic) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const base = lic.expiresAt && lic.expiresAt > new Date() ? lic.expiresAt : new Date();
      updateData.expiresAt = new Date(base.getTime() + data.extendDays * 86400000);
    }
    if (data.clearMachineId) {
      updateData.machineId = null;
      updateData.panelUrl = null;
    }
    if (data.reactivate) {
      updateData.status = "ACTIVE";
    }

    const license = await prisma.license.update({ where: { id }, data: updateData });
    return NextResponse.json({ license });
  } catch (e) {
    console.error("[admin/licenses PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { email, planId, term, durationDays, maxLines } = body;
    if (!email || !planId) {
      return NextResponse.json({ error: "email and planId required" }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    let licenseDurationDays: number;
    let expiresAt: Date | null = null;
    if (durationDays === 0) {
      licenseDurationDays = 36500;
      expiresAt = new Date("2099-12-31");
    } else if (term && term !== "plan") {
      licenseDurationDays =
        term === "1m" ? 30 : term === "3m" ? 90 : term === "6m" ? 180 : term === "1y" ? 365 : plan.durationDays;
      expiresAt = new Date(Date.now() + licenseDurationDays * 86400000);
    } else {
      licenseDurationDays = plan.durationDays;
      expiresAt = new Date(Date.now() + licenseDurationDays * 86400000);
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: email.split("@")[0], role: "USER", passwordHash: "external" },
      });
    }

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        planId: plan.id,
        amountCents: 0,
        status: "COMPLETED",
        licenseDurationDays,
      },
    });

    const issued = await issueLicenseForOrder(order.id);
    if (!issued) {
      return NextResponse.json({ error: "License issue failed" }, { status: 500 });
    }

    const license = await prisma.license.update({
      where: { id: issued.id },
      data: {
        expiresAt,
        maxLines: maxLines ? Number(maxLines) : plan.maxLines,
        notes: "Admin-issued",
      },
      include: { user: true, plan: true },
    });

    return NextResponse.json({ license, sync: { pushed: false } });
  } catch (e) {
    console.error("[admin/licenses POST]", e);
    return NextResponse.json({ error: "Issue failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();

    // Bulk delete ended trial licenses
    if (body.bulkEndedTrials) {
      const result = await prisma.license.deleteMany({
        where: {
          status: { in: ["REVOKED", "EXPIRED"] },
          plan: { slug: "trial" },
        },
      });
      return NextResponse.json({ deleted: result.count });
    }

    const ids: string[] = body.ids ?? (body.id ? [body.id] : []);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const result = await prisma.license.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    console.error("[admin/licenses DELETE]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

FILE_src_app_api_admin_licenses_route_ts

cat > "$MARKETING/scripts/sync-plans-vps.ts" << 'FILE_scripts_sync_plans_vps_ts'
/**
 * Sync single-plan pricing on VPS (no git required).
 * Run: cd /var/www/nexlify && npx tsx scripts/sync-plans-vps.ts
 */
import { prisma } from "../src/lib/prisma";

const UNLIMITED = 9999;
const PAID_CENTS = 5000;

async function main() {
  await prisma.plan.upsert({
    where: { slug: "trial" },
    update: {
      name: "7-Day Trial",
      description:
        "Full panel for 7 days — unlimited servers, all plugins, every feature. No card required.",
      priceCents: 0,
      durationDays: 7,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: "trial",
      sortOrder: 0,
      active: true,
    },
    create: {
      name: "7-Day Trial",
      slug: "trial",
      description:
        "Full panel for 7 days — unlimited servers, all plugins, every feature. No card required.",
      priceCents: 0,
      durationDays: 7,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: "trial",
      sortOrder: 0,
      active: true,
    },
  });

  await prisma.plan.upsert({
    where: { slug: "nexlify" },
    update: {
      name: "Nexlify License",
      description:
        "One simple plan — unlimited stream servers, all media & music plugins, every panel feature included.",
      priceCents: PAID_CENTS,
      durationDays: 30,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: null,
      sortOrder: 1,
      active: true,
    },
    create: {
      name: "Nexlify License",
      slug: "nexlify",
      description:
        "One simple plan — unlimited stream servers, all media & music plugins, every panel feature included.",
      priceCents: PAID_CENTS,
      durationDays: 30,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: null,
      sortOrder: 1,
      active: true,
    },
  });

  const off = await prisma.plan.updateMany({
    where: { slug: { in: ["starter", "main", "top-tier"] } },
    data: { active: false },
  });

  const active = await prisma.plan.findMany({
    where: { active: true },
    select: { slug: true, priceCents: true, maxServers: true },
    orderBy: { sortOrder: "asc" },
  });

  console.log("Deactivated legacy tiers:", off.count);
  console.log("Active plans:", active);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

FILE_scripts_sync_plans_vps_ts

echo "-> License signing key..."
for KEY in /home/nexlify-panel/.license-keys/private.pem /opt/nexlify-panel/.license-keys/private.pem; do
  if [ -f "$KEY" ]; then
    cp "$KEY" "$MARKETING/.license-keys/private.pem"
    chmod 600 "$MARKETING/.license-keys/private.pem"
    echo "   Copied from $KEY"
    break
  fi
done
[ -f "$MARKETING/.license-keys/private.pem" ] || echo "   WARNING: no private.pem — run: cd /home/nexlify-panel && npm run license:setup"

rm -f "$MARKETING/prisma.config.ts"

echo "-> npm install + sync plans..."
cd "$MARKETING"
npm install --include=dev --no-audit --no-fund 2>&1 | tail -2
npx tsx scripts/sync-plans-vps.ts 2>&1 || echo "   Plan sync warning — check DATABASE_URL"

echo "-> Build..."
rm -rf .next src/generated/prisma
npx prisma generate 2>&1 | tail -1
npm run build 2>&1 | tail -6

echo "-> Restart..."
pm2 restart nexlify-web --update-env 2>&1 | tail -2
sleep 3

echo ""
echo "=== Verify ==="
curl -s http://127.0.0.1:13001/pricing | grep -oE 'September 1|Nexlify License|7-Day Trial|Top Tier' | sort -u
[ -f .license-keys/private.pem ] && echo "License key: OK" || echo "License key: MISSING"
echo "Done — hard-refresh https://nexlify.live/pricing"
