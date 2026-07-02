"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { AdminStats } from "@/lib/admin-stats";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="font-display mt-2 text-3xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function trialDeletable(t: { status: string; expiresAt: string | null }): boolean {
  if (t.status === "REVOKED" || t.status === "EXPIRED") return true;
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return true;
  return false;
}

export function AdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/stats")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json() as Promise<AdminStats>;
      })
      .then(setStats)
      .catch(() => setError("Could not load statistics"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteTrial(id: string) {
    if (!confirm("Delete this ended/revoked trial license?")) return;
    setDeletingId(id);
    const res = await fetch("/api/admin/licenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeletingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Delete failed");
      return;
    }
    load();
  }

  async function bulkDeleteEndedTrials() {
    if (!confirm("Delete ALL ended/revoked trial licenses? This cannot be undone.")) return;
    setBulkDeleting(true);
    const res = await fetch("/api/admin/licenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulkEndedTrials: true }),
    });
    setBulkDeleting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "Bulk delete failed");
      return;
    }
    alert(`Deleted ${data.deleted ?? 0} trial licenses`);
    load();
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (!stats) {
    return <p className="text-slate-400 text-sm">Loading statistics…</p>;
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="glass rounded-2xl px-5 py-4">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Open tickets</p>
          <p className="font-display text-2xl font-bold text-white">{stats.openTickets}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/admin/licenses/export"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500/40"
          >
            Export CSV
          </a>
          <button
            type="button"
            onClick={bulkDeleteEndedTrials}
            disabled={bulkDeleting}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            {bulkDeleting ? "Deleting…" : "Bulk delete ended trials"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold text-white">Trial → paid conversion</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Conversion rate"
            value={`${stats.conversion.ratePercent}%`}
            hint={`${stats.conversion.convertedToPaid} of ${stats.conversion.trialUsers} trial users paid`}
          />
          <StatCard label="Trial-only users" value={stats.conversion.trialOnly} />
          <StatCard label="Converted to paid" value={stats.conversion.convertedToPaid} />
          <StatCard label="Unique trial users" value={stats.trials.uniqueUsers} />
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold text-white">7-day free trials</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Snapshot from {stats.generatedAt.slice(0, 10)}.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Trials started" value={stats.trials.total} />
          <StatCard label="Active now" value={stats.trials.active} hint="Not expired yet" />
          <StatCard
            label="Last 7 days"
            value={stats.trials.last7Days}
            hint={`${stats.trials.last30Days} in last 30 days`}
          />
          <StatCard
            label="Expired"
            value={stats.trials.expired}
            hint={`${stats.trials.uniqueUsers} unique users`}
          />
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold text-white">Paid license sales</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Licenses sold" value={stats.sales.total} />
          <StatCard
            label="Last 7 days"
            value={stats.sales.last7Days}
            hint={`${stats.sales.last30Days} in last 30 days`}
          />
          <StatCard
            label="Order revenue"
            value={formatMoney(stats.sales.revenueCents)}
            hint={`${stats.sales.completedPaidOrders} completed paid orders`}
          />
          <StatCard
            label="WHMCS sales"
            value={stats.sales.byChannel.whmcs}
            hint={`Stripe ${stats.sales.byChannel.stripe} · Manual ${stats.sales.byChannel.manual}`}
          />
        </div>

        {stats.sales.byPlan.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Licenses sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {stats.sales.byPlan.map((row) => (
                  <tr key={row.planId}>
                    <td className="px-4 py-3 text-white">{row.name}</td>
                    <td className="px-4 py-3 text-slate-300">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stats.coupons.length > 0 && (
        <div>
          <h2 className="font-display text-xl font-semibold text-white">Coupon usage</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Uses</th>
                  <th className="px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {stats.coupons.map((c) => (
                  <tr key={c.code}>
                    <td className="px-4 py-3 font-mono text-cyan-300">{c.code}</td>
                    <td className="px-4 py-3 text-slate-300">{c.uses}</td>
                    <td className="px-4 py-3 text-slate-300">{formatMoney(c.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">Recent trials</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {stats.recentTrials.length === 0 ? (
              <li className="text-[var(--muted)]">No trials yet.</li>
            ) : (
              stats.recentTrials.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                >
                  <span className="text-slate-200">{t.email}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-[var(--muted)]">
                      {t.status} · {t.createdAt.slice(0, 10)}
                    </span>
                    {trialDeletable(t) && (
                      <button
                        type="button"
                        onClick={() => deleteTrial(t.id)}
                        disabled={deletingId === t.id}
                        className="text-xs text-slate-400 hover:text-red-300 hover:underline disabled:opacity-50"
                      >
                        {deletingId === t.id ? "…" : "Delete"}
                      </button>
                    )}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-white">Recent sales</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {stats.recentSales.length === 0 ? (
              <li className="text-[var(--muted)]">No paid licenses yet.</li>
            ) : (
              stats.recentSales.map((s, i) => (
                <li
                  key={`${s.email}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                >
                  <span className="text-slate-200">
                    {s.email}{" "}
                    <span className="text-[var(--muted)]">({s.plan})</span>
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {s.source} · {s.createdAt.slice(0, 10)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Visitor analytics:{" "}
        <a
          href={stats.umami.dashboardUrl}
          className="text-violet-400 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          analytics.nexlify.live
        </a>
        . License data from this site&apos;s database.
      </p>
    </div>
  );
}
