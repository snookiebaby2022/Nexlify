import Link from "next/link";
import { Suspense } from "react";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { LegacyPanelPricingCompare } from "@/components/LegacyPanelPricingCompare";
import { PricingComparisonTable } from "@/components/PricingComparisonTable";
import { PageCta } from "@/components/PageCta";
import { PricingJsonLd } from "@/components/PricingJsonLd";
import { PluginPricingSection } from "@/components/PluginPricingSection";
import { PricingCheckoutLauncher } from "@/components/PricingCheckoutLauncher";
import { PricingSection } from "@/components/PricingSection";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { getSessionUser } from "@/lib/auth";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { toPlanView } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/pricing");



export default async function PricingPage() {
  const user = await getSessionUser();
  let plans: Awaited<ReturnType<typeof prisma.plan.findMany>> = [];
  try {
    plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch (error) {
    console.error("[pricing] database unavailable:", error);
  }

  return (
    <div className="mesh-bg">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ]}
      />
      <PricingJsonLd />
      <div className="mx-auto max-w-6xl px-4 pt-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
          Free until August 1, 2026
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold text-white md:text-5xl">
          All licenses free — IPTV reseller panel for operators worldwide
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
          Nexlify IPTV management software is free for all operators until August 1, 2026.
          Every license includes the WHMCS IPTV module, instant digital delivery, and full panel
          access — no credit card required during the free period.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <TrialCtaButton trackLabel="pricing_hero" loggedIn={Boolean(user)} />
          <p className="text-sm text-amber-300/90">
            <strong>Limited time:</strong> All plans are free — no coupon needed
          </p>
        </div>
        <PageCta
          className="mt-4"
          primary={{ label: "View license tiers below", href: "#license-tiers" }}
          secondary={[
            { label: "Try live demo", href: DEMO_PANEL_URL, external: true },
            { label: "WHMCS module docs", href: "/docs/whmcs" },
            { label: "All features", href: "/features" },
          ]}
        />
      </div>

      <section className="mx-auto max-w-4xl px-4 pb-10">
        <h2 className="font-display text-center text-2xl font-bold text-white">
          Why operators choose Nexlify IPTV reseller panel pricing
        </h2>
        <ul className="mx-auto mt-6 grid max-w-3xl gap-3 text-sm text-slate-300 sm:grid-cols-2">
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">WHMCS IPTV module included</strong> — auto-provision, renew,
              suspend on every plan
            </span>
          </li>
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">Anti-Freeze playback</strong> — reduce buffering complaints on
              residential lines
            </span>
          </li>
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">Built-in migration</strong> — preview import from XUI.one,
              1-stream, Xtream UI
            </span>
          </li>
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-emerald-400">✓</span>
            <span>
              <strong className="text-white">Security stack</strong> — 2FA, geo-blocking, leak audit logs,
              token TTL
            </span>
          </li>
        </ul>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-8" id="license-tiers">
        <h2 className="font-display text-center text-2xl font-bold text-white">
          License tiers for service providers
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-[var(--muted)]">
          Every plan includes the WHMCS IPTV module, encrypted license keys, and access to the
          one-click installer. All plans are <strong className="text-amber-300">free until August 1, 2026</strong> — no
          credit card required. Upgrade as your line count grows.
        </p>
        <h3 className="mt-8 text-center text-lg font-semibold text-violet-300">
          Currency and checkout options
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[var(--muted)]">
          Operators worldwide use the same Nexlify IPTV management software — choose GBP or USD at
          checkout. Questions?{" "}
          <Link href="/support" className="text-violet-400 hover:text-violet-300 underline">
            Open a support ticket
          </Link>
          .
        </p>
      </section>

      <LegacyPanelPricingCompare />

      <Suspense fallback={null}>
        <PricingCheckoutLauncher
          loggedIn={Boolean(user)}
          plans={plans.map((p) => ({ id: p.id, slug: p.slug }))}
        />
      </Suspense>

      <PricingComparisonTable />

      <PricingSection
        plans={plans.map(toPlanView)}
        loggedIn={Boolean(user)}
        stripeEnabled={isStripeConfigured()}
        whmcsCartBaseUrl={process.env.NEXT_PUBLIC_WHMCS_URL ?? null}
      />
      <PluginPricingSection whmcsCartBaseUrl={process.env.NEXT_PUBLIC_WHMCS_URL ?? null} />
    </div>
  );
}
