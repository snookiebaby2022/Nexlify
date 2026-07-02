"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormPageShell } from "@/components/form-page-shell";
import { FEATURE_PACKS } from "@/lib/feature-packs";

export default function MarketplacePage() {
  const [licensed, setLicensed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/admin/addon-licenses")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, boolean> = {};
        for (const l of d.licenses ?? []) {
          if (l.isActive) map[l.service] = true;
        }
        setLicensed(map);
      })
      .catch(() => {});
  }, []);

  return (
    <FormPageShell title="Feature Pack Marketplace" manageHref="/admin/addons" manageLabel="All Addons">
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Premium monthly packs via WHMCS — Transcoding, LB, Archive, Security, Analytics, DVR, or Full Enterprise
        bundle (£80–100/mo).
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {FEATURE_PACKS.map((pack) => {
          const active = licensed[pack.serviceId] || licensed.full_enterprise;
          return (
            <div
              key={pack.id}
              className="rounded-xl border p-5 flex flex-col gap-3"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold" style={{ color: pack.color }}>
                    {pack.name}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    £{pack.monthlyGbp.min}–{pack.monthlyGbp.max}/mo
                  </p>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    background: active ? "rgba(34,197,94,0.2)" : "rgba(148,163,184,0.15)",
                    color: active ? "#22c55e" : "var(--muted)",
                  }}
                >
                  {active ? "Licensed" : "Not licensed"}
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {pack.tagline}
              </p>
              <ul className="text-xs space-y-1 flex-1" style={{ color: "var(--muted)" }}>
                {pack.includes.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
              <Link
                href={pack.settingsHref}
                className="text-sm text-center rounded py-2 px-3 border"
                style={{ borderColor: pack.color, color: pack.color }}
              >
                Configure
              </Link>
            </div>
          );
        })}
      </div>
    </FormPageShell>
  );
}
