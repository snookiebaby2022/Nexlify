import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { UpdatesList } from "@/components/UpdatesList";
import { PANEL_RELEASES } from "@/lib/updates";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/updates");



const GUIDES = [
  {
    title: "WHMCS IPTV module setup guide",
    href: "/docs/whmcs",
    excerpt: "Connect GBP billing and auto-provision licenses on new orders.",
  },
  {
    title: "Cheap IPTV panel vs enterprise panel",
    href: "/compare/xtream-panel",
    excerpt: "What worldwide operators should compare before switching panels.",
  },
  {
    title: "Xtream panel installer on any VPS",
    href: "/install",
    excerpt: "One-command deploy with SSL, PM2, and PostgreSQL.",
  },
] as const;

export default function UpdatesPage() {
  const latest = PANEL_RELEASES[0];

  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Updates", path: "/updates" },
        ]}
      />
      <WebPageJsonLd path="/updates" name="IPTV panel updates & guides" description="Release notes, changelog, and operator guides for worldwide IPTV resellers." about="Updates" />

      <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          Worldwide · {site.domain}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          IPTV panel updates &amp; operator guides
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
          Release notes for the Nexlify IPTV panel plus guides for service providers — check back for
          WHMCS, streaming, and security improvements.
        </p>

        {latest && (
          <div className="mt-8 inline-flex flex-wrap items-center gap-3 rounded-2xl border border-violet-500/25 bg-violet-500/5 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">
              Latest release
            </span>
            <span className="font-display text-lg font-semibold text-white">v{latest.version}</span>
          </div>
        )}

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold text-white">Operator guides</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {GUIDES.map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="glass block rounded-2xl p-5 transition-colors hover:border-violet-500/30"
              >
                <h3 className="font-semibold text-violet-200">{g.title}</h3>
                <p className="mt-2 text-xs text-[var(--muted)]">{g.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold text-white">Release notes</h2>
          <div className="mt-6">
            <UpdatesList releases={PANEL_RELEASES} />
          </div>
        </section>

        <section className="glass mt-14 rounded-2xl p-6 md:p-8">
          <h2 className="font-display text-lg font-semibold text-white">Email updates</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Get IPTV panel release alerts for operators worldwide.
          </p>
          <div className="mt-4 max-w-md">
            <NewsletterSignup />
          </div>
        </section>
      </div>
    </div>
  );
}
