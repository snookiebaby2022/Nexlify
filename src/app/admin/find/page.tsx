"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { searchOperatorFeatures } from "@/lib/operator-feature-index";

export default function FindFeaturePage() {
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchOperatorFeatures(q), [q]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Find a feature</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Type the XUI One or 1-Stream name (VPN, overlay, shop, capture card, API) to jump to the Nexlify page.
          The sidebar search box does the same.
        </p>
      </div>
      <input
        type="search"
        autoFocus
        className="w-full rounded border px-3 py-2 text-sm bg-transparent"
        style={{ borderColor: "var(--border)" }}
        placeholder="VPN, overlay, capture, rclone, trials…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="divide-y rounded border" style={{ borderColor: "var(--border)" }}>
        {hits.map((f) => (
          <li key={`${f.href}-${f.label}`}>
            <Link href={f.href} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-white/5">
              <span>
                <span className="text-sm font-medium">{f.label}</span>
                <span className="block text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {f.aliases.slice(0, 4).join(" · ")}
                </span>
              </span>
              <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
                {f.group}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hits.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No matches. Try overlay, vpn, shop, or api.
        </p>
      ) : null}
    </div>
  );
}
