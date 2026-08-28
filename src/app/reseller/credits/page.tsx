"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

type CreditTx = {
  id: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
};

export default function ResellerMyCreditsPage() {
  const [credits, setCredits] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CreditTx[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/reseller/credits")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Failed to load credits");
        return d;
      })
      .then((d) => {
        const bal = typeof d.credits === "number" ? d.credits : 0;
        setCredits(bal);
        setTransactions(Array.isArray(d.transactions) ? d.transactions : []);
        window.dispatchEvent(
          new CustomEvent("nexlify-credits-updated", { detail: { credits: bal } })
        );
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load credit balance.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My credits</h1>
        <button
          type="button"
          onClick={load}
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)" }}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Available balance
        </p>
        <p className="text-4xl font-bold tabular-nums mt-2">
          {loading && credits === null ? "…" : credits === null ? "—" : credits}
        </p>
        <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
          Credits are deducted when you create or renew lines, and when you allocate balance to
          sub-resellers. Free trials (24h/48h) and 1-week packages do not charge credits.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Recent transactions</h2>
        <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
          {transactions.map((tx) => (
            <li key={tx.id} className="px-4 py-3 flex flex-wrap justify-between gap-2">
              <div>
                <span
                  className="font-medium tabular-nums"
                  style={{ color: tx.amount >= 0 ? "var(--success)" : "var(--danger)" }}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {tx.amount}
                </span>
                {tx.note && (
                  <span className="ml-2" style={{ color: "var(--muted)" }}>
                    {tx.note}
                  </span>
                )}
              </div>
              <div className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                Balance {tx.balanceAfter} · {formatDateTime(tx.createdAt)}
              </div>
            </li>
          ))}
          {!transactions.length && !loading && (
            <li className="px-4 py-6 text-center" style={{ color: "var(--muted)" }}>
              No credit transactions yet. Creating or renewing a paid line (1 month+) will appear
              here.
            </li>
          )}
          {loading && !transactions.length && (
            <li className="px-4 py-6 text-center" style={{ color: "var(--muted)" }}>
              Loading…
            </li>
          )}
        </ul>
      </div>

      <Link href="/reseller/users/credits" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        Transfer credits to sub-resellers →
      </Link>
    </div>
  );
}
