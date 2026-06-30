import { LpCtaPage } from "@/components/LpCtaPage";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/lp/reseller-panel");

export default function LpResellerPanelPage() {
  return (
    <LpCtaPage
      path="/lp/reseller-panel"
      breadcrumbLabel="IPTV reseller panel"
      h1="Launch your IPTV reseller business — without the legacy panel headaches"
      sub="Nexlify is the management software operators use to run lines, sub-resellers, and automated billing on their own servers. Start free, see the live demo, and deploy worldwide in one command."
      bullets={[
        "7-day free trial — no card required",
        "Live demo at panel.demo.nexlify.live",
        "WHMCS & Stripe auto-provisioning",
        "GBP or USD checkout worldwide",
        "One-click install on any VPS",
        "Sub-reseller hierarchy & white-label",
      ]}
      primaryHref="/register?trial=1&utm_source=ads&utm_medium=lp&utm_campaign=global_reseller"
      primaryLabel="Start free trial"
      primaryTrack="trial_start"
      badge="Software only · No content hosted by Nexlify"
    />
  );
}
