import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { PageCta } from "@/components/PageCta";
import { PricingComparisonTable } from "@/components/PricingComparisonTable";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/best-iptv-reseller-panel");

const PANELS = [
  {
    name: "Nexlify",
    highlight: true,
    pricing: "From £50/mo · 7-day trial",
    whmcs: "Native module",
    stability: "Node + PostgreSQL, PM2",
    verdict: "Best for WHMCS-first operators who want billing automation, GBP/USD checkout worldwide, and modern UX.",
  },
  {
    name: "Xtream UI",
    highlight: false,
    pricing: "Self-hosted · variable",
    whmcs: "Third-party scripts",
    stability: "PHP stacks vary by fork",
    verdict: "Familiar Xtream API, but WHMCS and multi-currency checkout usually require custom glue.",
  },
  {
    name: "XUI.one",
    highlight: false,
    pricing: "License + hosting",
    whmcs: "Bolt-on integrations",
    stability: "Mature but legacy architecture",
    verdict: "Large installed base; migration and WHMCS sync are common pain points for growing resellers.",
  },
  {
    name: "1-stream",
    highlight: false,
    pricing: "Fork-dependent",
    whmcs: "Third-party scripts",
    stability: "Varies by fork",
    verdict: "Common migration source; preview import and WHMCS sync are why operators move to Nexlify.",
  },
  {
    name: "Ministra (Stalker)",
    highlight: false,
    pricing: "Middleware licensing",
    whmcs: "Partner-dependent",
    stability: "MAG-focused middleware",
    verdict: "Strong for MAG portals; less turnkey for Xtream-style reseller panels and WHMCS carts.",
  },
] as const;

export default function BestIptvResellerPanelPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Best IPTV reseller panel", path: "/best-iptv-reseller-panel" },
        ]}
      />
      <WebPageJsonLd
        path="/best-iptv-reseller-panel"
        name="Best IPTV Reseller Panel in 2026 — Honest Comparison"
        description="Compare Nexlify vs Xtream UI, XUI.one, and Ministra for WHMCS support, stability, and reseller features."
        about="IPTV reseller panel comparison"
      />
      <SoftwareProductJsonLd path="/best-iptv-reseller-panel" includeProduct />

      <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          2026 comparison · Worldwide
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold text-white md:text-5xl">
          Nexlify vs all IPTV panels — XUI, 1-stream, Xtream, Ministra
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
          Best IPTV reseller panel comparison for 2026 — WHMCS IPTV module, Anti-Freeze, security,
          migration, and pricing vs XUI.one, 1-stream, Xtream UI, and Ministra.
        </p>

        <div className="mt-8 flex flex-col items-start gap-4">
          <TrialCtaButton trackLabel="best_panel_hero" />
        </div>
        <PageCta
          className="mt-2 !justify-start"
          primary={{ label: "Full XUI.one vs Nexlify guide", href: "/blog/xui-one-vs-nexlify-full-comparison" }}
          secondary={[
            { label: "Try live demo", href: DEMO_PANEL_URL, external: true },
            { label: "View pricing", href: "/pricing" },
            { label: "All features", href: "/features" },
          ]}
        />

        <div className="mt-16 space-y-6">
          {PANELS.map((panel) => (
            <article
              key={panel.name}
              className={`glass rounded-2xl p-6 md:p-8 ${
                panel.highlight ? "border-violet-500/35" : ""
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-bold text-white">{panel.name}</h2>
                {panel.highlight && (
                  <span className="rounded-full bg-violet-600/30 px-3 py-0.5 text-xs font-semibold text-violet-200">
                    Our pick
                  </span>
                )}
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">Pricing</dt>
                  <dd className="mt-1 text-slate-200">{panel.pricing}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">WHMCS</dt>
                  <dd className="mt-1 text-slate-200">{panel.whmcs}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted)]">Stack</dt>
                  <dd className="mt-1 text-slate-200">{panel.stability}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{panel.verdict}</p>
            </article>
          ))}
        </div>

        <div className="mt-16">
          <PricingComparisonTable />
        </div>

        <p className="mt-12 text-center text-sm text-[var(--muted)]">
          Ready to switch?{" "}
          <Link href="/install" className="text-violet-400 hover:text-violet-300 underline">
            One-click installer
          </Link>
          {" · "}
          <Link href="/whmcs" className="text-violet-400 hover:text-violet-300 underline">
            WHMCS module
          </Link>
          {" · "}
          <Link href="/compare/xtream-panel" className="text-violet-400 hover:text-violet-300 underline">
            Nexlify vs Xtream
          </Link>
        </p>
      </div>
    </div>
  );
}
