"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { readPendingCouponCode } from "@/lib/marketing-coupon";
import { formatPlanPrice, getPlanMarketing, isTrialPlan, PRICING_HONESTY_NOTE, FULL_PANEL_FEATURES } from "@/lib/plan-marketing";
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
    // During free period (Aug 1, 2026), all plans are free — bypass stripe check
    if (plan.priceCents > 0 && !stripeEnabled) {
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
            <span className="text-amber-300 font-semibold">Free until August 1, 2026</span> · instant digital delivery · no hidden fees
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
              All licenses free until August 1, 2026 — no coupon needed
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Plans differ by <strong className="text-slate-300">stream-server count</strong> and{" "}
            <strong className="text-slate-300">plugin access</strong> only — not by feature flags.
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
          <span className="text-amber-300/90">Free licenses end August 1, 2026</span>
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
