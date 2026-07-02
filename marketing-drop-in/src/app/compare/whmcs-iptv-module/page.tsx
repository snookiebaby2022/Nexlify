import { ComparePageShell } from "@/components/ComparePageShell";

const PATH = "/compare/whmcs-iptv-module";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/compare/whmcs-iptv-module");



const ROWS = [
  { feature: "Order → license key", nexlify: "Automatic", other: "Manual CSV / API hacks" },
  { feature: "Suspend / terminate sync", nexlify: "Real-time webhook", other: "Cron delays" },
  { feature: "Product ID mapping", nexlify: "Documented", other: "Undocumented" },
  { feature: "GBP & USD carts", nexlify: "Native WHMCS", other: "Plugin-dependent" },
  { feature: "Coupon checkout", nexlify: "API + Stripe", other: "Limited" },
  { feature: "Support docs", nexlify: "/docs/whmcs", other: "Forum-only" },
];

export default function CompareWhmcsPage() {
  return (
    <ComparePageShell
      path={PATH}
      breadcrumbLabel="WHMCS IPTV module"
      eyebrow="WHMCS integration"
      h1="WHMCS IPTV module built for Nexlify"
      intro="Connect your WHMCS store in London, Manchester, New York, or any region. Paid orders provision IPTV panel licenses instantly — the management tool stays aligned with billing."
      otherLabel="Generic WHMCS hooks"
      rows={ROWS}
      closing="See the WHMCS setup guide, compare features, or start a 7-day trial to test provisioning end-to-end."
    />
  );
}
