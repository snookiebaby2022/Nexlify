"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { SOFTWARE_POSITIONING } from "@/lib/marketing-constants";
import { FREE_PERIOD_END_LABEL, isFreePeriod } from "@/lib/marketing-coupon";
import { site } from "@/lib/site";

const HeroPanelCarousel = dynamic(
  () => import("@/components/HeroPanelCarousel").then((m) => ({ default: m.HeroPanelCarousel })),
  {
    loading: () => (
      <div
        className="skeleton-block min-h-[220px] w-full max-w-lg rounded-2xl sm:min-h-[320px] lg:min-h-[440px] lg:max-w-xl"
        aria-hidden
      />
    ),
    ssr: false,
  },
);

export function Hero() {
  return (
    <section className="relative overflow-hidden mesh-bg">
      <div className="pointer-events-none absolute inset-0 grid-pattern opacity-40" />

      <div className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl hero-orb" />
      <div className="pointer-events-none absolute -left-16 bottom-10 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl hero-orb" />
      <div className="pointer-events-none absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-cyan-500/8 blur-3xl hero-orb" />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-6 md:pb-28 md:pt-16 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:pt-20">
        {/* Copy first on phones so brand + CTA are in the first viewport */}
        <div className="order-1 lg:order-1">
          <p className="font-display text-sm font-semibold tracking-wide text-violet-300 sm:text-base">
            {site.name}
          </p>

          <h1 className="font-display mt-3 max-w-4xl text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
            IPTV reseller panel —{" "}
            <span className="text-gradient">management software</span> with live demo
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:mt-6 md:text-lg lg:text-xl">
            {SOFTWARE_POSITIONING} for businesses worldwide. Start a free trial, explore the live
            demo, and deploy on your own VPS.
          </p>

          {isFreePeriod() && (
            <p className="mt-4 text-sm font-medium text-amber-200">
              All licenses free until {FREE_PERIOD_END_LABEL} — no coupon needed
            </p>
          )}

          <ContentDisclaimer className="mt-4 max-w-2xl" />

          <div className="mt-6 md:mt-8">
            <TrialCtaButton trackLabel="hero_trial" />

            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
              <a
                href={DEMO_PANEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-track="demo_click"
                data-track-label="hero_demo"
                className="hover:text-violet-300 transition-colors"
              >
                Try live demo
              </a>
              <Link
                href="/pricing"
                data-track="checkout_start"
                data-track-label="hero_pricing"
                className="hover:text-violet-300 transition-colors"
              >
                View pricing
              </Link>
              <Link href="/install" className="hover:text-violet-300 transition-colors">
                Install panel
              </Link>
            </p>
          </div>
        </div>

        <div className="order-2 mt-10 lg:order-2 lg:mt-0">
          <HeroPanelCarousel />
        </div>

        {/* Stats below first viewport on mobile; full-width under hero on desktop */}
        <dl className="order-3 mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6 lg:col-span-2 lg:mt-12">
          {[
            { label: "AI Tools", value: "15 Built-in" },
            { label: "Features", value: "100+" },
            { label: "Zapping", value: "< 1s" },
            { label: "Billing", value: "billing" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl px-3 py-3 sm:px-4 sm:py-5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">{s.label}</dt>
              <dd className="font-display mt-1 text-base font-semibold text-white sm:text-lg">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
