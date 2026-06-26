"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { readPendingCouponCode } from "@/lib/marketing-coupon";

export type PlanView = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  durationDays: number;
  maxLines: number;
};

export function PricingCards({
  plans,
  loggedIn,
  stripeEnabled,
}: {
  plans: PlanView[];
  loggedIn: boolean;
  stripeEnabled: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(planId: string) {
    if (!loggedIn) {
      window.location.href = `/register?plan=${planId}`;
      return;
    }
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          couponCode: readPendingCouponCode() ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success && data.redirect) {
        window.location.href = data.redirect;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              i === 1
                ? "border-cyan-500/50 bg-gradient-to-b from-cyan-500/10 to-slate-900/50 shadow-lg shadow-cyan-500/10"
                : "border-slate-800 bg-slate-900/50"
            }`}
          >
            {i === 1 && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-3 py-0.5 text-xs font-semibold text-slate-950">
                Popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-slate-100">{plan.name}</h3>
            <p className="mt-2 flex-1 text-sm text-slate-400">{plan.description}</p>
            <p className="mt-6 text-3xl font-bold text-white">
              {formatMoney(plan.priceCents)}
              <span className="text-sm font-normal text-slate-500">
                /{plan.durationDays >= 365 ? "year" : `${plan.durationDays}d`}
              </span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              <li>Panel license key included</li>
              <li>Instant activation API</li>
            </ul>
            <button
              type="button"
              disabled={loading === plan.id}
              onClick={() => checkout(plan.id)}
              className={`mt-6 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                i === 1
                  ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  : "border border-slate-600 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-400"
              }`}
            >
              {loading === plan.id ? "Processing…" : "Buy license"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
