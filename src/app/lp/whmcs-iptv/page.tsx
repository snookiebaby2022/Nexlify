import { LpCtaPage } from "@/components/LpCtaPage";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/lp/whmcs-iptv");



export default function LpWhmcsIptvPage() {
  return (
    <LpCtaPage
      path="/lp/whmcs-iptv"
      breadcrumbLabel="WHMCS IPTV"
      h1="WHMCS IPTV module + panel license"
      sub="Connect your WHMCS cart to Nexlify. Customers worldwide get GBP or USD checkout with automatic license provisioning."
      bullets={[
        "Create, renew, suspend, terminate — synced",
        "Stripe + PayPal checkout support",
        "Documented setup at /docs/whmcs",
        "Cheap IPTV panel tiers from £50/mo",
        "Priority support for growing operators",
      ]}
      primaryHref="/pricing?utm_source=ads&utm_medium=lp&utm_campaign=whmcs_iptv"
      primaryLabel="View WHMCS plans"
    />
  );
}
