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

export function AdminMarketing() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-slate-400 text-sm">Loading marketing data…</p>;

  const freeActive = isFreePeriod();
  const daysLeft = daysUntilFreePeriodEnds();

  return (
    <div className="space-y-10">
      <section className="glass rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-6">
        <h2 className="font-display text-xl font-semibold text-white">Free license promotion</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Public messaging on nexlify.live — pricing, homepage, and the global promo banner.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[var(--muted)] text-xs">Status</p>
            <p className={`mt-1 font-semibold ${freeActive ? "text-emerald-400" : "text-slate-400"}`}>
              {freeActive ? "Active" : "Ended"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[var(--muted)] text-xs">Ends</p>
            <p className="mt-1 font-semibold text-amber-200">{FREE_PERIOD_END_LABEL}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-[var(--muted)] text-xs">Days remaining</p>
            <p className="mt-1 font-semibold text-white">{freeActive ? daysLeft : 0}</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          Checkout issues complimentary licenses automatically during the free period. After{" "}
          {FREE_PERIOD_END_LABEL}, paid checkout and the <code className="text-amber-300">NEXLIFY50</code> coupon banner
          take over.
        </p>
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
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="font-display text-xl font-semibold text-white">Growth toolkit</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          UTM link builder, QR codes, and campaign assets.
        </p>
        <Link
          href="/grow"
          className="mt-4 inline-block rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Open /grow →
        </Link>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-white">Umami analytics</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Real-time visitor stats for nexlify.live.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <a
            href={stats?.umami.dashboardUrl ?? "https://analytics.nexlify.live/dashboard"}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-violet-500/40 px-5 py-3 text-sm text-violet-200 hover:bg-violet-500/10"
          >
            Open Umami dashboard →
          </a>
          {stats?.umami.websiteId && (
            <span className="text-xs text-slate-500 self-center">
              Website ID: {stats.umami.websiteId}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Set UMAMI_WEBSITE_ID in env to display site ID here. Live metrics are viewed in Umami.
        </p>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-white">UTM / campaign summary</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          From user signups and completed paid orders (requires UTM capture on register/checkout).
        </p>
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
