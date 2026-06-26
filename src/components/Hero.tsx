"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { SOFTWARE_POSITIONING } from "@/lib/marketing-constants";
import { site } from "@/lib/site";

const HeroPanelCarousel = dynamic(
  () => import("@/components/HeroPanelCarousel").then((m) => ({ default: m.HeroPanelCarousel })),
  {
    loading: () => (
      <div
        className="skeleton-block min-h-[440px] w-full max-w-lg rounded-2xl lg:max-w-xl"
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

      <div className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl hero-orb" />

      <div className="pointer-events-none absolute -left-16 bottom-10 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl hero-orb" />



      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-6 md:pb-32 md:pt-16 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:pt-20">

        <div className="order-1 min-h-[440px] lg:order-2">

          <HeroPanelCarousel />

        </div>



        <div className="order-2 mt-10 lg:order-1 lg:mt-0">

          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 sm:px-4">

            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-composited-pulse" />

            IPTV reseller software · WHMCS billing · Live demo

          </div>



          <h1 className="font-display mt-6 max-w-4xl text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">

            IPTV reseller panel —{" "}

            <span className="text-gradient">management software</span> with live demo

          </h1>



          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg lg:text-xl">

            {site.name} is {SOFTWARE_POSITIONING} for businesses worldwide. Start a free trial,
            explore the live demo, and deploy on your own VPS in one command.

          </p>

          <ContentDisclaimer className="mt-4 max-w-2xl" />



          <div className="mt-8">
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



          <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">

            {[

              { label: "Regions", value: "Worldwide" },

              { label: "Playback", value: "Anti-Freeze" },

              { label: "Zapping", value: "< 1s" },

              { label: "Billing", value: "WHMCS" },

            ].map((s) => (

              <div key={s.label} className="glass rounded-2xl px-4 py-4 sm:py-5">

                <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">{s.label}</dt>

                <dd className="font-display mt-1 text-base font-semibold text-white sm:text-lg">

                  {s.value}

                </dd>

              </div>

            ))}

          </dl>

        </div>

      </div>

    </section>

  );

}


