import { ComparePageShell } from "@/components/ComparePageShell";

const PATH = "/compare/xtream-panel";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/compare/xtream-panel");



const ROWS = [
  { feature: "WHMCS auto-provisioning", nexlify: "Built-in module", other: "Often manual / third-party" },
  { feature: "License encryption", nexlify: "AES-256 + server binding", other: "Varies / often weak" },
  { feature: "Worldwide checkout", nexlify: "GBP + USD", other: "Rarely supported" },
  { feature: "Anti-Freeze playback", nexlify: "Included", other: "Uncommon" },
  { feature: "Reseller white-label", nexlify: "Included", other: "Partial" },
  { feature: "One-click installer", nexlify: "Ubuntu / Debian script", other: "Manual setup" },
  { feature: "7-day free trial", nexlify: "Yes", other: "Rare" },
];

export default function CompareXtreamPage() {
  return (
    <ComparePageShell
      path={PATH}
      breadcrumbLabel="Xtream panel comparison"
      eyebrow="Compare · Worldwide"
      h1="Nexlify vs generic Xtream panel"
      intro="Operators searching for an Xtream-compatible IPTV panel need more than playback URLs. Nexlify is full IPTV management software with WHMCS IPTV module automation, built for service service providers worldwide."
      otherLabel="Typical Xtream panel"
      rows={ROWS}
      closing="Nexlify is IPTV management software designed for revenue — not a script bundle. Open the live demo or start a trial before you commit."
    />
  );
}
