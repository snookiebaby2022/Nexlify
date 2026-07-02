"use client";

import dynamic from "next/dynamic";
import type { PlanView } from "@/lib/plans";

const PricingSection = dynamic(
  () => import("@/components/PricingSection").then((m) => ({ default: m.PricingSection })),
  { loading: () => <SectionSkeleton height="min-h-[560px]" /> },
);
const PluginPricingSection = dynamic(
  () =>
    import("@/components/PluginPricingSection").then((m) => ({
      default: m.PluginPricingSection,
    })),
  { loading: () => <SectionSkeleton height="min-h-[280px]" /> },
);
const NewsletterSignup = dynamic(
  () => import("@/components/NewsletterSignup").then((m) => ({ default: m.NewsletterSignup })),
  { loading: () => <SectionSkeleton height="min-h-[160px]" /> },
);

function SectionSkeleton({ height }: { height: string }) {
  return (
    <div
      className={`skeleton-block ${height} mx-auto my-8 max-w-6xl rounded-2xl`}
      aria-hidden
    />
  );
}

type HomeBelowFoldProps = {
  plans: PlanView[];
  loggedIn: boolean;
  stripeEnabled: boolean;
  whmcsCartBaseUrl: string | null;
};

export function HomePricingSections({
  plans,
  loggedIn,
  stripeEnabled,
  whmcsCartBaseUrl,
}: HomeBelowFoldProps) {
  return (
    <>
      <PricingSection
        plans={plans}
        loggedIn={loggedIn}
        stripeEnabled={stripeEnabled}
        whmcsCartBaseUrl={whmcsCartBaseUrl}
      />
      <PluginPricingSection whmcsCartBaseUrl={whmcsCartBaseUrl} />
    </>
  );
}

export function HomeNewsletterSignup() {
  return <NewsletterSignup />;
}
