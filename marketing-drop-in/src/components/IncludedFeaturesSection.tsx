import Link from "next/link";
import { FULL_PANEL_FEATURES } from "@/lib/plan-marketing";

export function IncludedFeaturesSection() {
  return (
    <section className="border-t border-white/10 bg-[#0a0814] py-16 md:py-20">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <h2 className="font-display text-2xl font-bold text-white">Everything included</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--muted)]">
          One license — unlimited stream servers, all media & music plugins, and the full Nexlify
          panel. No tier upgrades or add-on packs required.
        </p>
        <ul className="mx-auto mt-10 grid max-w-2xl gap-2 text-left text-sm text-slate-300 sm:grid-cols-2">
          {FULL_PANEL_FEATURES.map((feature) => (
            <li key={feature} className="flex gap-2 leading-snug">
              <span className="shrink-0 text-emerald-400/90" aria-hidden>
                ✓
              </span>
              {feature}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-[var(--muted)]">
          Questions?{" "}
          <Link href="/support" className="text-violet-400 hover:text-violet-300 underline">
            Open a support ticket
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
