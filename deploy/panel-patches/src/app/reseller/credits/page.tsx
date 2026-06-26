"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ResellerMyCreditsPage() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/profile")
      .then((r) => r.json())
      .then((d) => setCredits(d.user?.credits ?? null))
      .catch(() => setCredits(null));
  }, []);

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-semibold">My credits</h1>
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
      <Link href="/reseller/users/credits" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        Transfer credits to sub-resellers →
      </Link>
    </div>
  );
}
