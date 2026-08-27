"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

type SubRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  planSlug: string;
  status: string;
  stripeStatus: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  expiresAt: string | null;
  panelUrl: string | null;
  lastSyncError: string | null;
  updatedAt: string;
};

type BillingPayload = {
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  webhookUrl: string;
  summary: {
    subscriptions: number;
    pastDue: number;
    suspended: number;
    expiredTrials: number;
  };
  subscriptions: SubRow[];
};

export function AdminBilling() {
  const [data, setData] = useState<BillingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/billing")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load billing");
        return r.json() as Promise<BillingPayload>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: string, extra?: Record<string, unknown>) {
    setBusy(action + (extra?.licenseId ?? ""));
    setFlash(null);
    setError(null);
    const res = await fetch("/api/admin/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Action failed");
      return;
    }
    setFlash(
      action === "expirePastDue"
        ? `Marked ${body.marked ?? 0} past-due license(s) expired`
        : "Done"
    );
    load();
  }

  if (error && !data) {
    return <p className="text-sm text-red-300">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-400">Loading billing…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-5 space-y-3">
        <h2 className="font-display text-xl font-semibold text-white">Stripe subscriptions</h2>
        <p className="text-sm text-slate-400">
          Monthly recurring billing issues invoices via Stripe, extends licenses on{" "}
          <code className="text-cyan-300">invoice.paid</code>, and suspends the panel license on{" "}
          <code className="text-cyan-300">invoice.payment_failed</code>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Subscriptions" value={data.summary.subscriptions} />
          <Stat label="Past due / unpaid" value={data.summary.pastDue} warn={data.summary.pastDue > 0} />
          <Stat label="Suspended" value={data.summary.suspended} warn={data.summary.suspended > 0} />
          <Stat label="Expired trials" value={data.summary.expiredTrials} />
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm space-y-2">
          <p>
            Stripe secret:{" "}
            <span className={data.stripeConfigured ? "text-emerald-300" : "text-amber-300"}>
              {data.stripeConfigured ? "configured" : "missing STRIPE_SECRET_KEY"}
            </span>
          </p>
          <p>
            Webhook secret:{" "}
            <span className={data.webhookConfigured ? "text-emerald-300" : "text-amber-300"}>
              {data.webhookConfigured ? "configured" : "missing STRIPE_WEBHOOK_SECRET"}
            </span>
          </p>
          <p className="text-slate-400">
            Add this endpoint in Stripe Dashboard → Developers → Webhooks:
          </p>
          <code className="block break-all text-cyan-200">{data.webhookUrl}</code>
          <p className="text-xs text-slate-500">
            Events: <code>checkout.session.completed</code>, <code>invoice.paid</code>,{" "}
            <code>invoice.payment_failed</code>, <code>customer.subscription.updated</code>,{" "}
            <code>customer.subscription.deleted</code>
          </p>
          <p className="text-xs text-slate-500">
            On Plans → click <strong>Create Stripe price</strong> so each paid plan has a{" "}
            <em>monthly recurring</em> price (required for subscriptions).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy === "expirePastDue"}
            onClick={() => run("expirePastDue")}
            className="rounded-full border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {busy === "expirePastDue" ? "Working…" : "Expire past-due licenses now"}
          </button>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Refresh
          </button>
        </div>
        {flash ? <p className="text-sm text-emerald-300">{flash}</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Linked subscriptions
        </h3>
        {data.subscriptions.length === 0 ? (
          <p className="text-sm text-slate-500">
            No Stripe subscriptions linked yet. After you sync monthly prices and a customer
            checks out, they appear here.
          </p>
        ) : (
          data.subscriptions.map((row) => (
            <div key={row.id} className="glass rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-white">{row.email}</p>
                  <p className="text-xs text-slate-500">
                    {row.plan} · status <span className="text-slate-300">{row.status}</span>
                    {row.stripeStatus ? (
                      <>
                        {" "}
                        · Stripe <span className="text-slate-300">{row.stripeStatus}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Expires {row.expiresAt ? formatDate(row.expiresAt) : "—"}
                </p>
              </div>
              {row.subscriptionId ? (
                <p className="font-mono text-[11px] text-slate-500 break-all">{row.subscriptionId}</p>
              ) : null}
              {row.lastSyncError ? (
                <p className="text-xs text-amber-300">Panel sync: {row.lastSyncError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy === `syncPanel${row.id}`}
                  onClick={() => run("syncPanel", { licenseId: row.id })}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                >
                  Push to panel
                </button>
                {row.status === "SUSPENDED" ? (
                  <button
                    type="button"
                    disabled={busy === `unsuspend${row.id}`}
                    onClick={() => run("unsuspend", { licenseId: row.id })}
                    className="rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10"
                  >
                    Unsuspend
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === `suspend${row.id}`}
                    onClick={() => run("suspend", { licenseId: row.id })}
                    className="rounded-full border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10"
                  >
                    Suspend
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === `extendDays${row.id}`}
                  onClick={() => run("extendDays", { licenseId: row.id, days: 30 })}
                  className="rounded-full border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/10"
                >
                  Extend +30 days
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}
