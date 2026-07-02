"use client";

import { useCallback, useEffect, useState } from "react";

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  durationDays: number;
  maxLines: number;
  maxServers: number;
  stripePriceId: string | null;
  stripeProductId: string | null;
  whmcsProductId: number | null;
  badge: string | null;
  active: boolean;
  sortOrder: number;
};

export function AdminPlans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/plans");
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to load plans");
      return;
    }
    setPlans(data.plans ?? []);
    setStripeConfigured(Boolean(data.stripeConfigured));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function savePlan(plan: PlanRow) {
    setBusyId(plan.id);
    setError(null);
    const res = await fetch("/api/admin/plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        durationDays: plan.durationDays,
        maxLines: plan.maxLines,
        maxServers: plan.maxServers,
        stripePriceId: plan.stripePriceId || null,
        stripeProductId: plan.stripeProductId || null,
        whmcsProductId: plan.whmcsProductId,
        badge: plan.badge || null,
        active: plan.active,
        sortOrder: plan.sortOrder,
      }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Save failed");
      return;
    }
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...data.plan } : p)));
    setSavedId(plan.id);
    setTimeout(() => setSavedId(null), 2000);
  }

  async function syncStripe(planId: string) {
    setBusyId(planId);
    setError(null);
    const res = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "syncStripe", planId }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Stripe sync failed");
      return;
    }
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, ...data.plan } : p)));
  }

  function updatePlan(id: string, patch: Partial<PlanRow>) {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading plans…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">Plans & Stripe</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Set pricing and link each plan to a Stripe Price ID used at checkout.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            stripeConfigured
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-amber-500/15 text-amber-300"
          }`}
        >
          Stripe {stripeConfigured ? "configured" : "not configured — add STRIPE_SECRET_KEY to .env"}
        </span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-4">
        {plans.map((plan) => (
          <div key={plan.id} className="glass rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-violet-300">{plan.slug}</p>
                <input
                  value={plan.name}
                  onChange={(e) => updatePlan(plan.id, { name: e.target.value })}
                  className="mt-1 w-full max-w-md rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-semibold text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={plan.active}
                  onChange={(e) => updatePlan(plan.id, { active: e.target.checked })}
                />
                Active
              </label>
            </div>

            <textarea
              value={plan.description}
              onChange={(e) => updatePlan(plan.id, { description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs text-slate-400">
                Price (GBP pence)
                <input
                  type="number"
                  value={plan.priceCents}
                  onChange={(e) => updatePlan(plan.id, { priceCents: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Duration (days)
                <input
                  type="number"
                  value={plan.durationDays}
                  onChange={(e) => updatePlan(plan.id, { durationDays: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Max servers
                <input
                  type="number"
                  value={plan.maxServers}
                  onChange={(e) => updatePlan(plan.id, { maxServers: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Sort order
                <input
                  type="number"
                  value={plan.sortOrder}
                  onChange={(e) => updatePlan(plan.id, { sortOrder: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-400">
                Stripe Price ID
                <input
                  value={plan.stripePriceId ?? ""}
                  onChange={(e) => updatePlan(plan.id, { stripePriceId: e.target.value || null })}
                  placeholder="price_…"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Stripe Product ID
                <input
                  value={plan.stripeProductId ?? ""}
                  onChange={(e) => updatePlan(plan.id, { stripeProductId: e.target.value || null })}
                  placeholder="prod_…"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === plan.id}
                onClick={() => savePlan(plan)}
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {busyId === plan.id ? "Saving…" : savedId === plan.id ? "Saved" : "Save plan"}
              </button>
              <button
                type="button"
                disabled={!stripeConfigured || busyId === plan.id}
                onClick={() => syncStripe(plan.id)}
                className="rounded-full border border-cyan-500/40 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
              >
                Create Stripe price
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
