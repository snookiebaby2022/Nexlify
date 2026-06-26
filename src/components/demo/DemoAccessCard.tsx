"use client";

import { useState } from "react";
import type { DemoConfig } from "@/lib/demo";
import { CopyButton } from "@/components/CopyButton";

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 px-4 py-3">
      <div>
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p className="font-mono text-sm text-violet-200">{value}</p>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

export function DemoAccessCard({ demo }: { demo: DemoConfig }) {
  const [tab, setTab] = useState<"admin" | "reseller">("admin");

  const user = tab === "admin" ? demo.adminUser : demo.resellerUser;
  const pass = tab === "admin" ? demo.adminPassword : demo.resellerPassword;

  return (
    <div className="glass rounded-2xl p-6 md:p-8">
      <h2 className="font-display text-xl font-semibold text-white">Demo access</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Read-only sandbox at{" "}
        <span className="text-violet-300">panel.demo.nexlify.live</span> — no license key needed.
        Explore the UI; live playback and creating content are disabled.
      </p>

      <div className="mt-6 flex gap-2">
        {(["admin", "reseller"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${
              tab === t
                ? "bg-violet-500/30 text-violet-100"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {user && pass && (
        <div className="mt-4 space-y-2">
          <CredentialRow label="Username" value={user} />
          <CredentialRow label="Password" value={pass} />
        </div>
      )}

      {demo.panelUrl ? (
        <a
          href={demo.panelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-600/25 hover:brightness-110 transition-all"
        >
          Launch live panel demo
          <span aria-hidden>↗</span>
        </a>
      ) : (
        <p className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Set <code className="text-amber-100">NEXT_PUBLIC_DEMO_PANEL_URL</code> or run the panel
          on port <code className="text-amber-100">3000</code> behind nginx at{" "}
          <code className="text-amber-100">/panel/</code>.
        </p>
      )}
    </div>
  );
}
