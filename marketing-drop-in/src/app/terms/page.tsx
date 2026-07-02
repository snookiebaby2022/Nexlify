import { TermsContent } from "@/components/TermsContent";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/terms");

export default function TermsPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Terms", path: "/terms" },
        ]}
      />
      <WebPageJsonLd path="/terms" name="Terms and conditions" description="Terms and conditions for Nexlify products, software, websites, and services sold to worldwide IPTV resellers." about="Terms" />

    <div className="mesh-bg min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          {site.domain}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          Terms and conditions
        </h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Last updated June 2026 · Nexlify products, software, websites, and services
        </p>
        <div className="mt-10">
          <TermsContent />
        </div>
      </div>
    </div>
    </>
  );
}
