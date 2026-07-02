import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/affiliates");



export default function AffiliatesPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Affiliates", path: "/affiliates" },
        ]}
      />
      <WebPageJsonLd path="/affiliates" name="Nexlify affiliate program" description="Refer worldwide IPTV resellers to Nexlify and earn commission on panel license sales." about="Affiliates" />

      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">Partners</p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          Nexlify affiliate program
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          Refer operators worldwide to the best reseller panel on nexlify.live. Affiliates receive
          tracked links, campaign UTMs via our{" "}
          <Link href="/grow" className="text-violet-400 underline">
            growth toolkit
          </Link>
          , and commission on qualifying license sales.
        </p>
        <section className="mt-10 space-y-4 glass rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold text-white">How it works</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
            <li>Apply with your audience size and primary market (worldwide)</li>
            <li>Receive UTM-tracked promo links from /grow/links</li>
            <li>Earn commission when referred customers purchase a license</li>
          </ol>
        </section>
        <p className="mt-8 text-sm">
          Apply:{" "}
          <a href={`mailto:${site.salesEmail}?subject=Nexlify%20Affiliate%20Program`} className="text-violet-400 underline">
            {site.salesEmail}
          </a>
        </p>
      </div>
    </div>
  );
}
