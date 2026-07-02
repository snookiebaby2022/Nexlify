"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("/api/reseller/credits")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load credits");
        return r.json();
      })
      .then((d) => {
        setCredits(d.credits ?? null);
        setTransactions(d.transactions ?? []);
      })
      .catch(() => {
        setError("Could not load credit balance.");
        setCredits(null);
      });
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">My credits</h1>
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
          {credits === null ? "—" : credits}
        </p>
        <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
          Credits are used when you create lines and allocate balance to sub-resellers.
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
          {!transactions.length && (
            <li className="px-4 py-6 text-center" style={{ color: "var(--muted)" }}>
              No transactions yet
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
