import { ComparePageShell } from "@/components/ComparePageShell";

const PATH = "/vs/xui-one";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/vs/xui-one");



const ROWS = [
  { feature: "Modern stack", nexlify: "Node + PostgreSQL + PM2", other: "Legacy PHP stacks" },
  { feature: "WHMCS-native billing", nexlify: "First-class module", other: "Bolt-on scripts" },
  { feature: "Video / VOD workspace", nexlify: "Dedicated UI", other: "Mixed with live" },
  { feature: "Stream health alerts", nexlify: "Telegram + dashboard", other: "Basic logs" },
  { feature: "worldwide support", nexlify: "Tickets + docs", other: "Community-only" },
  { feature: "Migration path", nexlify: "Installer + docs", other: "Manual DB work" },
];

export default function VsXuiPage() {
  return (
    <ComparePageShell
      path={PATH}
      breadcrumbLabel="XUI alternative"
      eyebrow="Migration · Worldwide"
      h1="Modern IPTV panel alternative for XUI-style operators"
      intro="Service providers outgrowing legacy panels move to Nexlify for encrypted licensing, WHMCS IPTV module automation, and IPTV reseller software built for worldwide scale. Third-party product names are used descriptively only."
      otherLabel="Legacy XUI-style panel"
      rows={ROWS}
      closing="Run the one-click installer on a fresh VPS, open Import → Panel migration, and run Preview before cutover. See our migration checklist for XUI and 1-stream operators."
      relatedLinks={[
        { label: "Migration checklist", href: "/blog/migrate-from-xui-or-1-stream" },
        { label: "Compare vs 1-stream", href: "/vs/1-stream" },
        { label: "Try migration in demo", href: "https://panel.demo.nexlify.live/admin/import/migrate", external: true },
      ]}
    />
  );
}
