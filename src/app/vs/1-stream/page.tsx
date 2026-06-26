import { ComparePageShell } from "@/components/ComparePageShell";
import { pageSeo } from "@/lib/seo-pages";

const PATH = "/vs/1-stream";

export const metadata = pageSeo("/vs/1-stream");

const ROWS = [
  { feature: "Built-in panel migration", nexlify: "XUI, 1-stream, Xtream UI, Midnight Streamers", other: "Manual exports only" },
  { feature: "Preview before import", nexlify: "Dry-run in admin UI — see exactly what imports", other: "Risky live import, no preview" },
  { feature: "WHMCS license automation", nexlify: "Native module — auto keys, renewals, suspend, revoke", other: "Third-party scripts / manual CSV" },
  { feature: "Modern stack", nexlify: "Node + PostgreSQL + PM2 + nginx", other: "Legacy PHP (varies by fork)" },
  { feature: "Anti-Freeze playback", nexlify: "Built-in — reduces buffering at peak", other: "Not typical on forks" },
  { feature: "Sub-second zapping", nexlify: "Redis cache + neighbour prefetch", other: "Depends on fork/host config" },
  { feature: "Stream health alerts", nexlify: "Telegram + dashboard real-time", other: "Basic logs only" },
  { feature: "Reseller hierarchy", nexlify: "Credits, commissions, sub-resellers, white-label", other: "Basic sub-users, no credit tracking" },
  { feature: "Security (2FA, geo-block, leak audit)", nexlify: "Built-in enterprise-grade", other: "Varies / partial by fork" },
  { feature: "Support", nexlify: "In-panel tickets + docs + guides", other: "Community forums only" },
  { feature: "EPG management", nexlify: "Auto-updates + built-in editor", other: "Often manual or broken" },
  { feature: "API design", nexlify: "RESTful, documented, versioned", other: "Limited / legacy Xtream API" },
  { feature: "Pricing & trial", nexlify: "From £50/mo · 7-day free trial", other: "Fork-dependent / no trial" },
  { feature: "One-click installer", nexlify: "Ubuntu/Debian in minutes", other: "Manual setup required" },
  { feature: "GBP + USD checkout", nexlify: "Stripe + WHMCS native", other: "Requires custom integration" },
];

export default function VsOneStreamPage() {
  return (
    <ComparePageShell
      path={PATH}
      breadcrumbLabel="1-stream alternative"
      eyebrow="Migration · Worldwide"
      h1="IPTV panel alternative for 1-stream operators"
      intro="Operators on 1-stream forks move to Nexlify for a maintained reseller stack, WHMCS billing sync, and a guided import from your existing panel. Third-party product names are used descriptively only."
      otherLabel="1-stream / forked panel"
      rows={ROWS}
      closing="Start a 7-day trial, open Import → Panel migration, and run Preview before you point production traffic. See our step-by-step migration checklist for a full cutover plan."
      relatedLinks={[
        { label: "Full comparison blog", href: "/blog/1-stream-vs-nexlify-full-comparison" },
        { label: "Migration checklist", href: "/blog/migrate-from-xui-or-1-stream" },
        { label: "Compare vs XUI.one", href: "/vs/xui-one" },
        { label: "Try migration in demo", href: "https://panel.demo.nexlify.live/admin/import/migrate", external: true },
      ]}
    />
  );
}
