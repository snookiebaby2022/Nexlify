import Link from "next/link";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import {
  LpAuthorByline,
  LpDefinitionLead,
  LpFaqSection,
  LpPageJsonLd,
} from "@/components/LpGeoSections";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { NEXLIFY_LAUNCH_COUPON } from "@/lib/marketing-coupon";
import { CONTENT_DISCLAIMER, SOFTWARE_POSITIONING } from "@/lib/marketing-constants";

type LpCtaPageProps = {
  path: string;
  breadcrumbLabel: string;
  h1: string;
  sub: string;
  bullets: string[];
  primaryHref: string;
  primaryLabel: string;
  primaryTrack?: string;
  badge?: string;
  secondaryCtaLabel?: string;
};

const LP_TESTIMONIALS = [
  {
    quote: "Migrated from a legacy panel in one afternoon. WHMCS provisioning just works.",
    name: "James R.",
    detail: "850 lines · UK",
  },
  {
    quote: "The demo sold us before checkout. Support tickets dropped after we switched.",
    name: "Marcus T.",
    detail: "1,200 lines · US",
  },
  {
    quote: "2,000+ lines across sub-resellers. Telegram alerts alone are worth the license.",
    name: "Elena V.",
    detail: "EU · worldwide clients",
  },
] as const;

const WHY_NEXLIFY = [
  {
    title: "Start free, scale fast",
    desc: "7-day trial with no card. Upgrade when you are ready — keys delivered instantly.",
    icon: "⚡",
  },
  {
    title: "Billing on autopilot",
    desc: "WHMCS and Stripe sync create, renew, suspend, and revoke licenses automatically.",
    icon: "◆",
  },
  {
    title: "Deploy in minutes",
    desc: "One-click installer on Ubuntu or Debian. Your VPS, your stack, your customers.",
    icon: "▣",
  },
  {
    title: "Built for resellers",
    desc: "Sub-reseller hierarchy, credits, white-label, and commission reports out of the box.",
    icon: "◇",
  },
  {
    title: "See it before you buy",
    desc: "Full sandbox demo at panel.demo.nexlify.live — same UI as production.",
    icon: "▶",
  },
  {
    title: "Operator-grade security",
    desc: "Encrypted licenses, server binding, 2FA, and instant revoke when billing changes.",
    icon: "○",
  },
] as const;

const STEPS = [
  { step: "1", title: "Start trial or demo", desc: "Register free or explore the live sandbox — no commitment." },
  { step: "2", title: "Install on your VPS", desc: "Run the one-click script. Node, PostgreSQL, PM2, and nginx included." },
  { step: "3", title: "Connect billing & sell", desc: "Hook up WHMCS or Stripe. Licenses provision automatically on payment." },
] as const;

const LEGACY_VS = [
  { label: "Manual license CSVs", legacy: true, nexlify: false },
  { label: "WHMCS auto-provisioning", legacy: false, nexlify: true },
  { label: "Reseller hierarchy & credits", legacy: false, nexlify: true },
  { label: "Encrypted license binding", legacy: false, nexlify: true },
  { label: "Live demo before checkout", legacy: false, nexlify: true },
  { label: "One-click VPS install", legacy: false, nexlify: true },
] as const;

function CtaButtons({
  primaryHref,
  primaryLabel,
  primaryTrack,
  size = "default",
}: {
  primaryHref: string;
  primaryLabel: string;
  primaryTrack: string;
  size?: "default" | "large";
}) {
  const pad = size === "large" ? "px-8 py-3.5 text-base sm:px-10 sm:py-4 sm:text-lg" : "px-6 py-3 sm:px-8 sm:py-3.5";
  const btnBase =
    "inline-flex min-h-[44px] w-full items-center justify-center rounded-full font-semibold transition-all sm:w-auto";
  return (
    <nav className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center" aria-label="Page actions">
      <Link
        href={primaryHref}
        data-track={primaryTrack}
        data-track-label="lp_primary"
        className={`${btnBase} bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-110 ${pad}`}
      >
        {primaryLabel}
      </Link>
      <a
        href={DEMO_PANEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-track="demo_click"
        data-track-label="lp_demo"
        className={`${btnBase} border border-white/20 text-white hover:border-violet-400/40 hover:bg-white/5 ${pad}`}
      >
        Live demo
      </a>
      <Link
        href="/pricing"
        data-track="checkout_start"
        data-track-label="lp_pricing"
        className={`${btnBase} border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:border-violet-400/50 ${pad}`}
      >
        View pricing
      </Link>
    </nav>
  );
}

export function LpCtaPage({
  path,
  breadcrumbLabel,
  h1,
  sub,
  bullets,
  primaryHref,
  primaryLabel,
  primaryTrack = "checkout_start",
  badge = "IPTV reseller & management software",
  secondaryCtaLabel = "No card required · Cancel anytime during trial",
}: LpCtaPageProps) {
  return (
    <article className="mesh-bg">
      <LpPageJsonLd path={path} name={h1} description={sub} about={breadcrumbLabel} />

      <header className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute -right-32 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <section className="relative mx-auto max-w-4xl px-4 py-16 text-center md:py-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-composited-pulse" aria-hidden />
            {badge}
          </p>
          <h1 className="font-display mt-6 text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
            {h1}
          </h1>
          <LpDefinitionLead path={path} />
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted)] md:text-xl">
            {sub}
          </p>
          <ul className="mx-auto mt-8 grid max-w-lg gap-2 text-left text-sm text-slate-300 sm:grid-cols-2">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="shrink-0 text-emerald-400">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <CtaButtons
              primaryHref={primaryHref}
              primaryLabel={primaryLabel}
              primaryTrack={primaryTrack}
              size="large"
            />
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">{secondaryCtaLabel}</p>
          <p className="mt-3 text-sm text-amber-300/90">
            Launch offer: use code <strong className="text-amber-200">{NEXLIFY_LAUNCH_COUPON}</strong> at checkout
          </p>
          <ContentDisclaimer className="mx-auto mt-6 max-w-xl" />
        </section>
      </header>

      <section className="border-b border-white/10 bg-[#0a0814]/60 py-12" aria-labelledby="lp-social-proof">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="lp-social-proof" className="text-center text-xs font-semibold uppercase tracking-widest text-violet-300">
            Trusted by IPTV resellers worldwide
          </h2>
          <aside className="mt-8 grid gap-6 md:grid-cols-3" aria-label="Operator testimonials">
            {LP_TESTIMONIALS.map((t) => (
              <blockquote key={t.name} className="glass rounded-2xl p-6 text-left">
                <p className="text-sm leading-relaxed text-slate-300">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-4 text-xs text-[var(--muted)]">
                  <cite className="not-italic">
                    <span className="font-semibold text-white">{t.name}</span>
                    {" · "}
                    {t.detail}
                  </cite>
                </footer>
              </blockquote>
            ))}
          </aside>
        </div>
      </section>

      {/* Why Nexlify */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
            Everything you need to run a reseller business
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-[var(--muted)]">
            {SOFTWARE_POSITIONING}. You bring the infrastructure — we handle the back office.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_NEXLIFY.map((item) => (
              <article key={item.title} className="glass rounded-2xl p-6">
                <span className="text-2xl" aria-hidden>{item.icon}</span>
                <h3 className="font-display mt-3 font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-white/10 bg-[#080612] py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
            Live in three steps
          </h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.step} className="text-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-amber-500 font-display text-lg font-bold text-white">
                  {s.step}
                </span>
                <h3 className="font-display mt-4 font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <LpFaqSection path={path} />

      <section className="py-16 md:py-20" aria-labelledby="lp-comparison">
        <div className="mx-auto max-w-2xl px-4">
          <h2 id="lp-comparison" className="font-display text-center text-2xl font-bold text-white md:text-3xl">
            Why operators switch to Nexlify
          </h2>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-[280px] w-full text-xs sm:text-sm">
              <thead className="bg-white/5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left sm:px-4">Feature</th>
                  <th scope="col" className="px-3 py-3 text-center sm:px-4">Legacy panel</th>
                  <th scope="col" className="px-3 py-3 text-center text-violet-300 sm:px-4">Nexlify</th>
                </tr>
              </thead>
              <tbody>
                {LEGACY_VS.map((row) => (
                  <tr key={row.label} className="border-t border-white/10">
                    <th scope="row" className="px-3 py-3 text-left font-normal text-slate-300 sm:px-4">{row.label}</th>
                    <td className="px-3 py-3 text-center text-slate-500 sm:px-4">{row.legacy ? "✓" : "—"}</td>
                    <td className="px-3 py-3 text-center text-emerald-400 sm:px-4">{row.nexlify ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            {CONTENT_DISCLAIMER}
          </p>
        </div>
      </section>

      <section className="border-t border-white/10 bg-gradient-to-b from-violet-950/40 to-[#05040a] py-20" aria-labelledby="lp-final-cta">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 id="lp-final-cta" className="font-display text-3xl font-bold text-white md:text-4xl">
            Ready to grow your reseller business?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--muted)]">
            Join operators worldwide who run lines, resellers, and billing on Nexlify — without
            manual license spreadsheets or fragile scripts.
          </p>
          <div className="mt-10">
            <CtaButtons
              primaryHref={primaryHref}
              primaryLabel={primaryLabel}
              primaryTrack={primaryTrack}
              size="large"
            />
          </div>
          <p className="mt-6 text-sm text-[var(--muted)]">
            Questions?{" "}
            <Link href="/help" className="text-violet-300 hover:text-white transition-colors">
              Read the FAQ
            </Link>
            {" · "}
            <Link href="/install" className="text-violet-300 hover:text-white transition-colors">
              Install guide
            </Link>
          </p>
        </div>
      </section>

      <LpAuthorByline path={path} />
    </article>
  );
}
