import { LpCtaPage } from "@/components/LpCtaPage";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/lp/reseller-panel-uk");

export default function LpResellerUkPage() {
  return (
    <LpCtaPage
      path="/lp/reseller-panel-uk"
      breadcrumbLabel="UK reseller panel"
      h1="UK IPTV reseller panel with GBP billing — built for operators who scale"
      sub="Run lines, resellers, and WHMCS billing on your own UK or EU VPS. Instant license keys, no shipping, and a full demo before you commit."
      bullets={[
        "GBP checkout via WHMCS or Stripe",
        "7-day free trial — no card required",
        "Live demo at panel.demo.nexlify.live",
        "Deploy on London or Manchester VPS",
        "WHMCS auto-provisioning included",
        "Telegram alerts & reseller tools",
      ]}
      primaryHref="/register?trial=1&utm_source=ads&utm_medium=lp&utm_campaign=uk_reseller"
      primaryLabel="Start UK free trial"
      primaryTrack="trial_start"
      badge="UK & worldwide · Software only"
    />
  );
}
