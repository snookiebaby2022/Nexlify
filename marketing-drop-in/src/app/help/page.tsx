import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { FaqJsonLd } from "@/components/FaqJsonLd";
import { HelpFaqSection, HelpQuickLinks } from "@/components/HelpFaqSection";
import { PanelInstallInstructions } from "@/components/PanelInstallInstructions";
import { FAQ_CATEGORIES, HELP_QUICK_LINKS } from "@/lib/help-faq";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/help");



export default function HelpPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Help & FAQ", path: "/help" },
        ]}
      />
      <FaqJsonLd />
      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          Worldwide · {site.domain}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          IPTV panel help &amp; FAQ for worldwide operators
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
          Installation guides, WHMCS IPTV module setup, GBP and USD billing, and answers for service
          service providers worldwide. Can&apos;t find what you need?{" "}
          <Link href="/support" className="text-violet-400 hover:text-violet-300 underline">
            open a support ticket
          </Link>
          .
        </p>

        <section id="install" className="mt-12 scroll-mt-24">
          <h2 className="font-display text-lg font-semibold text-white">Panel installation</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Step-by-step guide for a fresh Ubuntu or Debian VPS in any region worldwide.
          </p>
          <div className="mt-4">
            <PanelInstallInstructions compact />
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-lg font-semibold text-white">Quick links</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Documentation, billing, and account tools.
          </p>
          <div className="mt-4">
            <HelpQuickLinks links={HELP_QUICK_LINKS} />
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-lg font-semibold text-white">
            Frequently asked questions
          </h2>
          <div className="mt-6">
            <HelpFaqSection categories={FAQ_CATEGORIES} />
          </div>
        </section>

        <section className="glass mt-14 rounded-2xl p-6 text-center md:p-8">
          <h2 className="font-display text-xl font-semibold text-white">Still need help?</h2>
          <p className="mt-3 text-sm text-slate-300">
            Our team handles license, WHMCS, and panel setup questions for worldwide customers
            through support tickets.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/support"
              className="inline-flex rounded-full bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-90"
            >
              Create a support ticket
            </Link>
            <Link
              href="/demo"
              className="inline-flex rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-violet-400/40 hover:text-white"
            >
              Try the panel demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Email:{" "}
            <a
              href={`mailto:${site.supportEmail}`}
              className="text-violet-300 hover:text-violet-200"
            >
              {site.supportEmail}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
