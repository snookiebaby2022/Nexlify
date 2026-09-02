"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { AdminStats } from "@/lib/admin-stats";
import {
  daysUntilFreePeriodEnds,
  FREE_PERIOD_END_LABEL,
  isFreePeriod,
} from "@/lib/marketing-coupon";

type BillingLinks = {
  stripeDashboard: string;
  stripeWebhooks: string;
  stripeApiKeys: string;
  paypalDeveloper: string;
  paypalSandbox: string;
};

type BillingSettingsView = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePublishableKey: string;
  paypalClientId: string;
  paypalClientSecret: string;
  paypalSandbox: boolean;
  paypalWebhookId: string;
  stripeConfigured: boolean;
  stripeSecretSet: boolean;
  stripeWebhookSet: boolean;
  paypalConfigured: boolean;
  paypalSecretSet: boolean;
  webhookUrl: string;
  paypalWebhookUrl: string;
  links: BillingLinks;
};

type TestResult = {
  ok: boolean;
  results: Record<string, { ok: boolean; message: string }>;
};

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-300">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-slate-600"
      />
    </label>
  );
}

export function AdminMarketing() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingSettingsView | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingSaved, setBillingSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setStatsError(null);
    setBillingError(null);
    setLoading(true);

    const statsPromise = fetch("/api/admin/stats")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Stats failed (${r.status})`);
        }
        return r.json() as Promise<AdminStats>;
      })
      .then((data) => {
        setStats(data);
      })
      .catch((e) => {
        setStatsError(e instanceof Error ? e.message : "Could not load statistics");
      });

    const billingPromise = fetch("/api/admin/billing-settings")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load billing settings");
        return r.json() as Promise<BillingSettingsView>;
      })
      .then((data) => {
        setBilling(data);
      })
      .catch((e) => {
        setBillingError(e instanceof Error ? e.message : "Failed to load billing settings");
      });

    Promise.all([statsPromise, billingPromise]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveBilling() {
    if (!billing) return;
    setBillingSaving(true);
    setBillingSaved(false);
    setBillingError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/billing-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeSecretKey: billing.stripeSecretKey,
          stripeWebhookSecret: billing.stripeWebhookSecret,
          stripePublishableKey: billing.stripePublishableKey,
          paypalClientId: billing.paypalClientId,
          paypalClientSecret: billing.paypalClientSecret,
          paypalSandbox: billing.paypalSandbox,
          paypalWebhookId: billing.paypalWebhookId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setBilling(data);
      setBillingSaved(true);
      setTimeout(() => setBillingSaved(false), 3000);
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBillingSaving(false);
    }
  }

  async function testConnections() {
    setTesting(true);
    setTestResult(null);
    setBillingError(null);
    try {
      const res = await fetch("/api/admin/billing-settings", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setTestResult(data);
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  async function copyWebhookUrl() {
    if (!billing?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(billing.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setBillingError("Could not copy webhook URL");
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading marketing data…</p>;

  const freeActive = isFreePeriod();
  const daysLeft = daysUntilFreePeriodEnds();

  return (
    <div className="space-y-10">
      {statsError ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Stats: {statsError}
          <button type="button" onClick={load} className="ml-3 underline hover:text-amber-100">
            Retry
          </button>
        </div>
      ) : null}

      <section
        className={`glass rounded-2xl border p-6 ${
          freeActive
            ? "border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10"
            : "border-slate-800 bg-slate-900/40"
        }`}
      >
        <h2 className="font-display text-xl font-semibold text-white">Free license promotion</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {freeActive
            ? "Public messaging on nexlify.live — pricing, homepage, and the global promo banner."
            : "The launch free-license period has ended. Paid checkout uses Stripe & PayPal below."}
        </p>
        {freeActive ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-[var(--muted)] text-xs">Status</p>
                <p className="mt-1 font-semibold text-emerald-400">Active</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-[var(--muted)] text-xs">Ends</p>
                <p className="mt-1 font-semibold text-amber-200">{FREE_PERIOD_END_LABEL}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-[var(--muted)] text-xs">Days remaining</p>
                <p className="mt-1 font-semibold text-white">{daysLeft}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/pricing"
                target="_blank"
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-slate-950 hover:brightness-110"
              >
                Preview pricing page →
              </Link>
              <Link
                href="/"
                target="_blank"
                className="rounded-lg border border-amber-500/40 px-5 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
              >
                Preview homepage banner →
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            Ended {FREE_PERIOD_END_LABEL}. Configure Stripe and PayPal in the section below.
          </p>
        )}
      </section>

      <section className="glass rounded-2xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Checkout payments</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Configure Stripe and PayPal for nexlify.live checkout. GBP is the default currency; customers
              can switch to USD on the pricing page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 ${billing?.stripeConfigured ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}
            >
              Stripe {billing?.stripeConfigured ? "ready" : "off"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 ${billing?.paypalConfigured ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}
            >
              PayPal {billing?.paypalConfigured ? "ready" : "off"}
            </span>
          </div>
        </div>

        {billingError ? (
          <p className="text-sm text-red-300" role="alert">
            {billingError}
          </p>
        ) : null}

        {billing ? (
          <>
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-white">Stripe</h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <a
                      href={billing.links.stripeApiKeys}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-300 hover:underline"
                    >
                      API keys →
                    </a>
                    <a
                      href={billing.links.stripeWebhooks}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-300 hover:underline"
                    >
                      Webhooks →
                    </a>
                    <a
                      href={billing.links.stripeDashboard}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-300 hover:underline"
                    >
                      Dashboard →
                    </a>
                  </div>
                </div>
                <Field
                  label="Secret key"
                  value={billing.stripeSecretKey}
                  onChange={(v) => setBilling({ ...billing, stripeSecretKey: v })}
                  type="password"
                  placeholder={billing.stripeSecretSet ? "Leave blank to keep current key" : "sk_live_… or sk_test_…"}
                  hint="Required for card checkout and subscriptions."
                />
                <Field
                  label="Webhook signing secret"
                  value={billing.stripeWebhookSecret}
                  onChange={(v) => setBilling({ ...billing, stripeWebhookSecret: v })}
                  type="password"
                  placeholder={billing.stripeWebhookSet ? "Leave blank to keep current secret" : "whsec_…"}
                  hint="Optional but recommended for renewals and failed payments."
                />
                <Field
                  label="Publishable key (optional)"
                  value={billing.stripePublishableKey}
                  onChange={(v) => setBilling({ ...billing, stripePublishableKey: v })}
                  placeholder="pk_live_…"
                />
              </div>

              <div className="space-y-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-white">PayPal</h3>
                  <a
                    href={billing.paypalSandbox ? billing.links.paypalSandbox : billing.links.paypalDeveloper}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-300 hover:underline"
                  >
                    Developer apps →
                  </a>
                </div>
                <Field
                  label="Client ID"
                  value={billing.paypalClientId}
                  onChange={(v) => setBilling({ ...billing, paypalClientId: v })}
                  placeholder="From PayPal developer dashboard"
                />
                <Field
                  label="Client secret"
                  value={billing.paypalClientSecret}
                  onChange={(v) => setBilling({ ...billing, paypalClientSecret: v })}
                  type="password"
                  placeholder={billing.paypalSecretSet ? "Leave blank to keep current secret" : "Secret key"}
                />
                <Field
                  label="Webhook ID"
                  value={billing.paypalWebhookId}
                  onChange={(v) => setBilling({ ...billing, paypalWebhookId: v })}
                  placeholder="WH-…"
                  hint="Required for monthly renewals. Create webhook at PayPal Developer → Webhooks pointing to the PayPal webhook URL below."
                />
                <label className="flex items-center gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={billing.paypalSandbox}
                    onChange={(e) => setBilling({ ...billing, paypalSandbox: e.target.checked })}
                    className="rounded border-slate-600"
                  />
                  Sandbox mode (uncheck for live PayPal)
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm">
              <p className="text-slate-300 font-medium">Stripe webhook endpoint</p>
              <p className="mt-1 text-xs text-slate-500">
                Add this URL in Stripe → Developers → Webhooks. Events:{" "}
                <code className="text-cyan-300">checkout.session.completed</code>,{" "}
                <code className="text-cyan-300">invoice.paid</code>,{" "}
                <code className="text-cyan-300">invoice.payment_failed</code>.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-black/40 px-3 py-2 text-xs text-cyan-200">
                  {billing.webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={copyWebhookUrl}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm">
              <p className="text-slate-300 font-medium">PayPal webhook endpoint</p>
              <p className="mt-1 text-xs text-slate-500">
                Add this URL in PayPal Developer → Webhooks. Events:{" "}
                <code className="text-cyan-300">BILLING.SUBSCRIPTION.ACTIVATED</code>,{" "}
                <code className="text-cyan-300">PAYMENT.SALE.COMPLETED</code>,{" "}
                <code className="text-cyan-300">BILLING.SUBSCRIPTION.PAYMENT.FAILED</code>,{" "}
                <code className="text-cyan-300">BILLING.SUBSCRIPTION.CANCELLED</code>.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-black/40 px-3 py-2 text-xs text-cyan-200">
                  {billing.paypalWebhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(billing.paypalWebhookUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Saved to <code className="text-cyan-300">data/billing-settings.json</code> on the server.
              Env vars (<code className="text-cyan-300">STRIPE_SECRET_KEY</code>,{" "}
              <code className="text-cyan-300">PAYPAL_CLIENT_ID</code>, etc.) are used as fallback when
              fields are empty.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveBilling}
                disabled={billingSaving}
                className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {billingSaving ? "Saving…" : "Save payment settings"}
              </button>
              <button
                type="button"
                onClick={testConnections}
                disabled={testing}
                className="rounded-lg border border-slate-600 px-5 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {testing ? "Testing…" : "Test connections"}
              </button>
              {billingSaved ? <span className="text-sm text-emerald-400">Saved</span> : null}
            </div>

            {testResult ? (
              <div className="space-y-2 text-sm">
                {Object.entries(testResult.results).map(([provider, result]) => (
                  <p key={provider} className={result.ok ? "text-emerald-300" : "text-amber-300"}>
                    <span className="font-medium capitalize">{provider}</span>: {result.message}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">Billing settings could not be loaded.</p>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="font-display text-xl font-semibold text-white">Growth toolkit</h2>
        <Link
          href="/grow"
          className="mt-4 inline-block rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Open /grow →
        </Link>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-white">Umami analytics</h2>
        <a
          href={stats?.umami.dashboardUrl ?? "https://analytics.nexlify.live/dashboard"}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-lg border border-violet-500/40 px-5 py-3 text-sm text-violet-200 hover:bg-violet-500/10"
        >
          Open Umami dashboard →
        </a>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-white">UTM / campaign summary</h2>
        {!stats?.utmSummary.length ? (
          <p className="mt-4 text-slate-500 text-sm">No UTM data yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Medium</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Signups</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {stats.utmSummary.map((u, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-cyan-300">{u.source}</td>
                    <td className="px-4 py-3 text-slate-300">{u.medium ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-300">{u.campaign ?? "—"}</td>
                    <td className="px-4 py-3">{u.signups}</td>
                    <td className="px-4 py-3">{u.orders}</td>
                    <td className="px-4 py-3">{formatMoney(u.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
