"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { isFreePeriod } from "@/lib/marketing-coupon";
import { CHECKOUT_TAGLINE, pricingHonestyNote } from "@/lib/marketing-copy";
import {
  formatPlanPrice,
  getPlanMarketing,
  isTrialPlan,
  FULL_PANEL_FEATURES,
  postPromoPriceLabel,
} from "@/lib/plan-marketing";
import { FALLBACK_PLANS, gbpToUsdCents, type PlanView } from "@/lib/plans";
import {
  DEFAULT_CHECKOUT_CURRENCY,
  type CheckoutCurrency,
  type CheckoutPaymentMethod,
} from "@/lib/checkout-currency";

type PricingSectionProps = {
  plans: PlanView[];
  loggedIn: boolean;
  stripeEnabled: boolean;
  paypalEnabled?: boolean;
};

function displayPriceCents(plan: PlanView, currency: CheckoutCurrency): number {
  return currency === "GBP" ? plan.priceCents : gbpToUsdCents(plan.priceCents);
}

export function PricingSection({
  plans,
  loggedIn,
  stripeEnabled,
  paypalEnabled = false,
}: PricingSectionProps) {
  const router = useRouter();
  const [currency, setCurrency] = useState<CheckoutCurrency>(DEFAULT_CHECKOUT_CURRENCY);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("stripe");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const freeActive = isFreePeriod();

  useEffect(() => {
    fetch("/api/checkout/options")
      .then((r) => r.json())
      .then((data: { stripe?: boolean; paypal?: boolean }) => {
        if (data.paypal && !data.stripe) setPaymentMethod("paypal");
      })
      .catch(() => {});
  }, []);

  const tiers = plans.length > 0 ? plans : FALLBACK_PLANS;
  const gridCols =
    tiers.length >= 4
      ? "md:grid-cols-2 xl:grid-cols-4"
      : tiers.length === 3
        ? "md:grid-cols-3"
        : "md:grid-cols-2";

  const showPaymentPicker = loggedIn && (stripeEnabled || paypalEnabled) && !freeActive;

  async function buy(plan: PlanView) {
    if (!loggedIn) {
      const next = encodeURIComponent("/pricing");
      window.location.href = isTrialPlan(plan)
        ? `/register?trial=1`
        : `/login?next=${next}`;
      return;
    }
    if (isTrialPlan(plan)) {
      setLoadingId(plan.id);
      setError(null);
      try {
        const res = await fetch("/api/trial", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Trial could not be started");
        router.push(data.redirect ?? "/dashboard");
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Trial could not be started");
      } finally {
        setLoadingId(null);
      }
      return;
    }
    if (plan.priceCents > 0 && !stripeEnabled && !paypalEnabled && !freeActive) {
      setError("Checkout is not configured — contact support.");
      return;
    }
    if (plan.priceCents > 0 && !freeActive && paymentMethod === "stripe" && !stripeEnabled) {
      setError("Card checkout (Stripe) is not configured — try PayPal or contact support.");
      return;
    }
    if (plan.priceCents > 0 && !freeActive && paymentMethod === "paypal" && !paypalEnabled) {
      setError("PayPal checkout is not configured — try card payment or contact support.");
      return;
    }
    setLoadingId(plan.id);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, currency, paymentMethod }),
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

  return (
    <section className="py-16 md:py-24" id="pricing">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-[var(--muted)]">
            {freeActive ? (
              <>
                <span className="font-semibold text-amber-300">Limited-time free licenses</span>
                {" · "}instant delivery · no hidden fees
              </>
            ) : (
              <>
                <span className="font-semibold text-violet-300">{CHECKOUT_TAGLINE}</span>
                {" · "}7-day trial available
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {showPaymentPicker ? (
              <div className="inline-flex rounded-full border border-white/15 p-1" role="group" aria-label="Payment method">
                {stripeEnabled ? (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("stripe")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold min-h-[44px] ${
                      paymentMethod === "stripe" ? "bg-violet-600 text-white" : "text-[var(--muted)] hover:text-white"
                    }`}
                  >
                    Card
                  </button>
                ) : null}
                {paypalEnabled ? (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("paypal")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold min-h-[44px] ${
                      paymentMethod === "paypal" ? "bg-violet-600 text-white" : "text-[var(--muted)] hover:text-white"
                    }`}
                  >
                    PayPal
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="inline-flex rounded-full border border-white/15 p-1" role="group" aria-label="Currency">
              {(["GBP", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold min-h-[44px] ${
                    currency === c ? "bg-violet-600 text-white" : "text-[var(--muted)] hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!freeActive && (stripeEnabled || paypalEnabled) ? (
          <p className="mt-4 text-center text-xs text-slate-500">
            {stripeEnabled ? "Stripe" : ""}
            {stripeEnabled && paypalEnabled ? " · " : ""}
            {paypalEnabled ? "PayPal" : ""}
            {" · "}GBP default · USD available at checkout
          </p>
        ) : null}

        {freeActive ? (
          <div className="mt-8 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Limited time</p>
            <p className="mt-2 text-sm text-slate-300">
              All paid-plan licenses are complimentary during the launch period — no payment required.
            </p>
          </div>
        ) : null}

        <ul className="mt-8 grid gap-2 sm:grid-cols-2 text-sm text-slate-300">
          {FULL_PANEL_FEATURES.slice(0, 6).map((feature) => (
            <li key={feature} className="flex gap-2 leading-snug">
              <span className="shrink-0 text-emerald-400/90">✓</span>
              {feature}
            </li>
          ))}
        </ul>

        <div className={`mt-10 grid gap-6 ${gridCols}`}>
          {tiers.map((plan) => {
            const marketing = getPlanMarketing(plan);
            const price = displayPriceCents(plan, currency);
            const priceDisplay = formatPlanPrice(plan, formatMoney(price, currency));

            return (
              <div
                key={plan.id}
                className={`glass relative flex flex-col rounded-2xl p-6 ${
                  marketing.highlight || plan.badge
                    ? "border-violet-500/50 shadow-lg shadow-violet-500/10"
                    : marketing.isTrial
                      ? "border-emerald-500/30"
                      : ""
                }`}
              >
                {plan.badge ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-semibold uppercase text-white">
                    {plan.badge}
                  </span>
                ) : null}
                <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
                <p className="mt-2 min-h-[2.5rem] text-sm text-[var(--muted)]">{plan.description}</p>
                <p className="font-display mt-6 text-3xl font-bold text-white sm:text-4xl">
                  {priceDisplay}
                  {!marketing.isTrial && plan.priceCents > 0 && !freeActive ? (
                    <span className="text-base font-normal text-[var(--muted)]">/mo</span>
                  ) : null}
                  {marketing.isTrial ? (
                    <span className="text-base font-normal text-emerald-400/90"> · 7 days</span>
                  ) : null}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">
                  {marketing.planLimits.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="text-amber-400">●</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {loggedIn || !marketing.primaryHref ? (
                    <button
                      type="button"
                      onClick={() => buy(plan)}
                      disabled={loadingId === plan.id || plan.id.startsWith("fallback-")}
                      className={`w-full min-h-[44px] rounded-full py-3 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50 ${
                        marketing.isTrial
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                          : "bg-gradient-to-r from-amber-500 to-orange-500"
                      }`}
                    >
                      {loadingId === plan.id ? "Redirecting…" : marketing.primaryLabel}
                    </button>
                  ) : (
                    <Link
                      href={marketing.primaryHref}
                      className="block w-full min-h-[44px] rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-center text-sm font-semibold text-slate-950"
                    >
                      {marketing.primaryLabel}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 max-w-3xl mx-auto text-center text-xs text-[var(--muted)]">
          {pricingHonestyNote()}
        </p>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          Not sure yet?{" "}
          <Link href="/demo" className="text-violet-400 hover:underline">
            Explore the live demo
          </Link>
          {!freeActive ? (
            <>
              {" · "}
              <span className="text-amber-300/90">{postPromoPriceLabel()}</span>
            </>
          ) : null}
        </p>
        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
