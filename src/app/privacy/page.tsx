import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { PrivacyContent } from "@/components/PrivacyContent";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/privacy");



export default function PrivacyPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ]}
      />
      <WebPageJsonLd path="/privacy" name="Privacy policy" description="How Nexlify handles personal data for worldwide customers — cookies, analytics, billing, and privacy rights." about="Privacy" />

      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">{site.domain}</p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">Privacy policy</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          How Nexlify handles personal data for customers worldwide.
        </p>
        <div className="mt-10">
          <PrivacyContent />
        </div>
      </div>
    </div>
  );
}
