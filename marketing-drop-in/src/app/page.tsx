import { ComplianceSection } from "@/components/ComplianceSection";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoScreenshots } from "@/components/DemoScreenshots";
import { Features } from "@/components/Features";
import { TechStackSection } from "@/components/TechStackSection";
import { Hero } from "@/components/Hero";
import { HomeFaqJsonLd } from "@/components/HomeFaqJsonLd";
import { HomeNewsletterSignup, HomePricingSections } from "@/components/HomeBelowFold";
import { HomeSeoContent } from "@/components/HomeSeoContent";
import { SocialProofSection } from "@/components/SocialProofSection";
import { MigrationCtaSection } from "@/components/MigrationCtaSection";
import { getSessionUser } from "@/lib/auth";
import { toPlanView } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { pageSeo } from "@/lib/seo-pages";
import { isStripeConfigured } from "@/lib/stripe";

export const metadata = pageSeo("/");

export default async function HomePage() {
  const user = await getSessionUser();
  let plans: Awaited<ReturnType<typeof prisma.plan.findMany>> = [];
  try {
    plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  } catch (error) {
    console.error("[home] database unavailable:", error);
  }

  const whmcsCartBaseUrl = process.env.NEXT_PUBLIC_WHMCS_URL ?? null;

  return (
    <>
      <HomeFaqJsonLd />
      <Hero />
      <SocialProofSection />
      <DemoScreenshots />
      <HomePricingSections
        plans={plans.map(toPlanView)}
        loggedIn={Boolean(user)}
        stripeEnabled={isStripeConfigured()}
        whmcsCartBaseUrl={whmcsCartBaseUrl}
      />
      <MigrationCtaSection />
      <TechStackSection />
      <Features />
      <DemoBanner />
      <HomeSeoContent />
      <ComplianceSection />
      <section className="border-t border-white/10 bg-[#080612] py-16">
        <div className="mx-auto max-w-xl px-4 text-center">
          <h2 className="font-display text-xl font-semibold text-white">IPTV operator updates</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            worldwide release notes and reseller tips — no spam.
          </p>
          <div className="mt-6">
            <HomeNewsletterSignup />
          </div>
        </div>
      </section>
    </>
  );
}
