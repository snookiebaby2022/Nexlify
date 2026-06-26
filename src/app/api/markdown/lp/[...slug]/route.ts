import { LP_GEO_CONTENT, generateLpMarkdown } from "@/lib/lp-geo-content";

const LP_PAGE_COPY: Record<
  string,
  { title: string; summary: string; bullets: string[] }
> = {
  "/lp/cut-the-cord-streaming": {
    title: "Cut the Cord Streaming Platform Software | Nexlify",
    summary:
      "Launch or upgrade a premium digital entertainment business with Nexlify: live TV streaming service tools, WHMCS billing, and HD streaming player app-compatible stack.",
    bullets: [
      "Cut the cord streaming infrastructure on your VPS",
      "Live TV streaming service management in one dashboard",
      "Help subscribers watch live sports online with Anti-Freeze",
      "HD streaming player app & STB compatibility",
      "GBP/USD checkout · 7-day trial",
      "Software only — compliant operator positioning",
    ],
  },
  "/lp/live-tv-streaming-platform": {
    title: "Live TV Streaming Platform — HD Player & Sports | Nexlify",
    summary:
      "Management software for operators building premium digital entertainment businesses with HD player compatibility and sports-grade playback.",
    bullets: [
      "Built for live TV streaming service operators worldwide",
      "Anti-Freeze + fast zapping for live sports",
      "Xtream-compatible HD streaming player app URLs",
      "Premium digital entertainment branding & white-label",
      "Cut the cord streaming stack — Node + PostgreSQL",
      "7-day free trial · No card required",
    ],
  },
  "/lp/reseller-panel": {
    title: "IPTV Reseller Panel — WHMCS IPTV Module & Trial",
    summary:
      "Nexlify is the management software operators use to run lines, sub-resellers, and automated billing on their own servers.",
    bullets: [
      "7-day free trial — no card required",
      "Live demo at panel.demo.nexlify.live",
      "WHMCS & Stripe auto-provisioning",
      "GBP or USD checkout worldwide",
      "One-click install on any VPS",
      "Sub-reseller hierarchy & white-label",
    ],
  },
  "/lp/reseller-panel-uk": {
    title: "UK IPTV Reseller Panel — WHMCS IPTV Module",
    summary:
      "Run lines, resellers, and WHMCS billing on your own UK or EU VPS with GBP checkout.",
    bullets: [
      "GBP checkout via WHMCS or Stripe",
      "7-day free trial — no card required",
      "Live demo at panel.demo.nexlify.live",
      "Deploy on London or Manchester VPS",
      "WHMCS auto-provisioning included",
      "Telegram alerts & reseller tools",
    ],
  },
  "/lp/whmcs-iptv": {
    title: "WHMCS IPTV Module — IPTV Reseller Panel Licenses",
    summary:
      "Connect your WHMCS cart to Nexlify for automatic license provisioning worldwide.",
    bullets: [
      "Create, renew, suspend, terminate — synced",
      "Stripe + PayPal checkout support",
      "Documented setup at /docs/whmcs",
      "Panel tiers from £50/mo",
      "Priority support for growing operators",
    ],
  },
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;
  const path = `/lp/${slug.join("/")}`;
  const geo = LP_GEO_CONTENT[path];
  const copy = LP_PAGE_COPY[path];

  if (!geo || !copy) {
    return new Response("Not found", { status: 404 });
  }

  const markdown = generateLpMarkdown({
    path,
    title: copy.title,
    definition: geo.definition,
    summary: copy.summary,
    bullets: copy.bullets,
    geo,
  });

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
