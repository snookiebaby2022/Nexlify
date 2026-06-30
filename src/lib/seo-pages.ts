import { DEFAULT_OG_IMAGE_PATH } from "@/lib/marketing-constants";
import { withCoreKeywords } from "@/lib/seo-keywords";
import { pageMetadata } from "@/lib/seo";

type PageSeoEntry = {
  title: string;
  description: string;
  keywords?: string[];
  noIndex?: boolean;
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
  };
};

/** Optimized titles (50–60 chars) and descriptions (≤160 chars) for indexable pages. */
export const SEO_PAGES = {
  "/": {
    title: "IPTV Reseller Panel & WHMCS IPTV Module | Nexlify",
    description:
      "Nexlify IPTV reseller panel and IPTV management software with WHMCS IPTV module automation, anti-freeze playback, and 7-day trial. Worldwide resellers.",
    keywords: withCoreKeywords(["global IPTV panel", "best reseller panel", "Xtream panel"]),
    openGraph: {
      title: "IPTV Reseller Panel & WHMCS IPTV Module | Nexlify",
      description:
        "IPTV reseller panel + IPTV management software. WHMCS IPTV module, GBP & USD checkout, one-click installer.",
      image: DEFAULT_OG_IMAGE_PATH,
    },
  },
  "/demo": {
    title: "Live IPTV Reseller Panel Demo — IPTV Management Software",
    description:
      "Try the Nexlify IPTV reseller panel live demo — IPTV management software with WHMCS IPTV module flows. Same stack as production. No signup required.",
    keywords: withCoreKeywords(["IPTV panel demo", "Xtream panel", "global IPTV panel"]),
  },
  "/pricing": {
    title: "Nexlify IPTV Reseller Panel Pricing — vs XUI.one",
    description:
      "Compare Nexlify IPTV reseller panel pricing vs legacy XUI.one forks. WHMCS IPTV module included. IPTV management software from £50/mo with 7-day trial.",
    keywords: withCoreKeywords(["IPTV panel pricing", "XUI.one alternative"]),
  },
  "/features": {
    title: "IPTV Reseller Panel Features — WHMCS IPTV Module & Tools",
    description:
      "Nexlify IPTV management software features: WHMCS IPTV module, Anti-Freeze, reseller hierarchy, security, and billing tools for IPTV reseller panel operators.",
    keywords: withCoreKeywords(["Xtream panel", "best reseller panel"]),
  },
  "/install": {
    title: "Install IPTV Reseller Panel — IPTV Management Software",
    description:
      "One-command install for Nexlify IPTV reseller panel on Ubuntu/Debian. IPTV management software with WHMCS IPTV module support. Node, PostgreSQL, PM2, nginx.",
    keywords: withCoreKeywords(["Xtream panel", "IPTV panel installer", "VPS install"]),
  },
  "/help": {
    title: "IPTV Reseller Panel Help — WHMCS IPTV Module & Setup FAQ",
    description:
      "IPTV reseller panel help: WHMCS IPTV module setup, IPTV management software licensing, VPS install, GBP/USD checkout, trial coupons, and support FAQs.",
    keywords: withCoreKeywords(["IPTV panel help", "best reseller panel"]),
  },
  "/register": {
    title: "Register IPTV Reseller Panel — 7-Day Free Trial",
    description:
      "Create your Nexlify IPTV reseller panel account. IPTV management software with WHMCS IPTV module included. 7-day free trial, instant license delivery.",
    keywords: withCoreKeywords(["IPTV panel trial", "IPTV reseller registration"]),
  },
  "/updates": {
    title: "IPTV Reseller Panel Updates & Operator Guides",
    description:
      "Release notes and guides for Nexlify IPTV management software — WHMCS IPTV module, IPTV reseller panel security, streaming, and billing updates for worldwide operators.",
    keywords: withCoreKeywords(["IPTV panel updates"]),
  },
  "/status": {
    title: "Nexlify Status — IPTV Reseller Panel & WHMCS Uptime",
    description:
      "Check Nexlify IPTV reseller panel, WHMCS IPTV module, licensing API, demo, and billing uptime. Real-time status for IPTV management software operators worldwide.",
    keywords: withCoreKeywords(["Nexlify status", "IPTV panel uptime"]),
  },
  "/requirements": {
    title: "IPTV Reseller Panel VPS Requirements — Nexlify",
    description:
      "Server requirements for Nexlify IPTV management software and IPTV reseller panel on VPS — Ubuntu, Node.js, PostgreSQL, Redis, nginx, PM2.",
    keywords: withCoreKeywords(["VPS requirements", "streaming server"]),
  },
  "/docs/whmcs": {
    title: "WHMCS IPTV Module Docs — IPTV Reseller Panel Integration",
    description:
      "Install the Nexlify WHMCS IPTV module to auto-create, renew, and revoke IPTV reseller panel licenses. IPTV management software for WHMCS worldwide.",
    keywords: withCoreKeywords(["IPTV panel integration", "license management"]),
  },
  "/compare/xtream-panel": {
    title: "Nexlify vs Xtream Panel — IPTV Reseller Panel",
    description:
      "Compare Nexlify IPTV reseller panel vs Xtream panels. IPTV management software with WHMCS IPTV module, Anti-Freeze, and security for resellers worldwide.",
    keywords: withCoreKeywords(["Xtream panel", "best reseller panel"]),
  },
  "/compare/whmcs-iptv-module": {
    title: "WHMCS IPTV Module — IPTV Reseller Panel Automation",
    description:
      "Nexlify WHMCS IPTV module for IPTV reseller panel licenses. IPTV management software with auto-keys, renewals, suspend/revoke, and add-on entitlements.",
    keywords: withCoreKeywords(["license automation"]),
  },
  "/vs/xui-one": {
    title: "XUI.one Alternative — IPTV Reseller Panel & WHMCS IPTV Module",
    description:
      "Nexlify vs XUI.one: IPTV reseller panel with migration tools, WHMCS IPTV module, and IPTV management software. Telegram alerts and modern UX.",
    keywords: withCoreKeywords(["XUI alternative", "best reseller panel"]),
  },
  "/blog/migrate-from-xui-or-1-stream": {
    title: "Migrate XUI.one → IPTV Reseller Panel",
    description:
      "Step-by-step migration from XUI.one to Nexlify IPTV reseller panel. WHMCS IPTV module setup, preview import, and IPTV management software.",
    keywords: withCoreKeywords(["XUI migration"]),
  },
  "/lp/reseller-panel": {
    title: "IPTV Reseller Panel — WHMCS IPTV Module & Trial",
    description:
      "Nexlify IPTV reseller panel with WHMCS IPTV module, GBP/USD checkout, live demo, and 7-day trial. IPTV management software for resellers worldwide.",
    keywords: withCoreKeywords(["best reseller panel", "IPTV panel trial"]),
  },
  "/lp/reseller-panel-uk": {
    title: "UK IPTV Reseller Panel — WHMCS IPTV Module",
    description:
      "Nexlify UK IPTV reseller panel with GBP billing, WHMCS IPTV module, and IPTV management software. 7-day trial for British resellers.",
    keywords: withCoreKeywords(["global IPTV panel", "best reseller panel"]),
  },
  "/lp/whmcs-iptv": {
    title: "WHMCS IPTV Module — IPTV Reseller Panel Licenses",
    description:
      "Sell IPTV reseller panel licenses via WHMCS IPTV module. Nexlify IPTV management software auto-creates, renews, and revokes keys for customers worldwide.",
    keywords: withCoreKeywords(["IPTV panel license", "WHMCS integration"]),
  },
  "/lp/live-tv-streaming-platform": {
    title: "Live TV Streaming Platform — HD Player & Sports | Nexlify",
    description:
      "Live TV streaming service platform for operators. HD streaming player app support, watch live sports online quality, premium digital entertainment tools. 7-day trial.",
    keywords: [
      "live tv streaming service",
      "watch live sports online",
      "hd streaming player app",
      "premium digital entertainment",
      "cut the cord streaming",
    ],
    openGraph: {
      title: "Live TV Streaming Platform — HD Player & Sports | Nexlify",
      description:
        "Operator platform for live TV streaming services. HD player compatibility, sports playback, premium digital entertainment tools.",
      image: DEFAULT_OG_IMAGE_PATH,
    },
  },
  "/lp/cut-the-cord-streaming": {
    title: "Cut the Cord Streaming Platform Software | Nexlify",
    description:
      "Cut the cord streaming management software. Run a live TV streaming service with premium digital entertainment branding and HD streaming player app compatibility.",
    keywords: [
      "cut the cord streaming",
      "live tv streaming service",
      "premium digital entertainment",
      "hd streaming player app",
      "watch live sports online",
    ],
    openGraph: {
      title: "Cut the Cord Streaming Platform Software | Nexlify",
      description:
        "Cut the cord streaming management software for licensed operators. Live TV service tools, WHMCS billing, HD player compatibility.",
      image: DEFAULT_OG_IMAGE_PATH,
    },
  },
  "/affiliates": {
    title: "Nexlify Affiliate Program — IPTV Reseller Panel",
    description:
      "Refer IPTV reseller panel customers to Nexlify. IPTV management software with WHMCS IPTV module — affiliate program for resellers worldwide.",
    keywords: withCoreKeywords(["IPTV affiliate", "reseller panel affiliate"]),
  },
  "/brand": {
    title: "Nexlify Brand Kit — IPTV Reseller Panel Assets",
    description:
      "Download Nexlify logos and assets for IPTV reseller panel marketing. IPTV management software and WHMCS IPTV module branding for resellers worldwide.",
    keywords: withCoreKeywords(["Nexlify brand"]),
  },
  "/privacy": {
    title: "Nexlify Privacy Policy — IPTV Reseller Panel",
    description:
      "Privacy for Nexlify IPTV reseller panel and IPTV management software — cookies, analytics, billing, and WHMCS IPTV module data for customers worldwide.",
    keywords: withCoreKeywords(["privacy policy", "GDPR", "CCPA"]),
  },
  "/terms": {
    title: "Nexlify Terms — IPTV Reseller Panel License",
    description:
      "Terms for Nexlify IPTV management software and IPTV reseller panel licenses. WHMCS IPTV module usage, liability, and service boundaries.",
    keywords: withCoreKeywords(["terms and conditions", "IPTV panel license"]),
  },
  "/refund-policy": {
    title: "Nexlify Refund Policy — IPTV Reseller Panel Licenses",
    description:
      "Refund policy for Nexlify IPTV reseller panel licenses. IPTV management software with WHMCS IPTV module — trial terms, chargebacks, and support.",
    keywords: withCoreKeywords(["refund policy"]),
  },
  "/livestream": {
    title: "Nexlify Live Stream — IPTV Reseller Panel Demos",
    description:
      "Live demos and updates for Nexlify IPTV reseller panel and IPTV management software. WHMCS IPTV module sessions for resellers worldwide.",
    keywords: withCoreKeywords(["Nexlify live stream"]),
  },
  "/whmcs": {
    title: "WHMCS IPTV Module — IPTV Reseller Panel Automation",
    description:
      "WHMCS IPTV module for Nexlify IPTV reseller panel: auto-provision, renewals, suspensions. IPTV management software with Stripe/PayPal worldwide.",
    keywords: withCoreKeywords(["WHMCS IPTV", "license automation"]),
  },
  "/best-iptv-reseller-panel": {
    title: "Best IPTV Reseller Panel 2026 — Nexlify vs XUI.one",
    description:
      "Best IPTV reseller panel 2026: Nexlify vs XUI.one, 1-stream, Xtream UI. IPTV management software with WHMCS IPTV module, pricing, and stability.",
    keywords: withCoreKeywords(["best iptv reseller panel", "IPTV panel comparison"]),
  },
  "/blog": {
    title: "IPTV Reseller Panel Blog — WHMCS & Operator Guides",
    description:
      "Guides for IPTV reseller panel, WHMCS IPTV module, and IPTV management software. Reseller playbooks and operator tips for service providers worldwide.",
    keywords: withCoreKeywords(["IPTV reseller guide", "become a reseller"]),
  },
  "/login": {
    title: "Sign In — Nexlify IPTV Reseller Panel Account",
    description:
      "Sign in to your Nexlify IPTV reseller panel account. Manage IPTV management software licenses, WHMCS IPTV module, and billing.",
    noIndex: true,
  },
  "/admin": {
    title: "Admin — Nexlify IPTV Reseller Panel",
    description: "Nexlify admin dashboard for IPTV reseller panel and IPTV management software.",
    noIndex: true,
  },
  "/admin/tickets": {
    title: "Admin Tickets — Nexlify IPTV Reseller Panel",
    description: "Admin support tickets for Nexlify IPTV reseller panel and WHMCS IPTV module.",
    noIndex: true,
  },
  "/dashboard": {
    title: "My Licenses — Nexlify IPTV Reseller Panel",
    description:
      "Manage Nexlify IPTV reseller panel licenses, trials, and billing. IPTV management software with WHMCS IPTV module.",
    noIndex: true,
  },
  "/support": {
    title: "Support — Nexlify IPTV Reseller Panel",
    description:
      "Support tickets for Nexlify IPTV reseller panel, WHMCS IPTV module, and IPTV management software.",
    noIndex: true,
  },
  "/checkout/success": {
    title: "Checkout Complete — Nexlify IPTV Reseller Panel",
    description:
      "Order confirmation for Nexlify IPTV reseller panel license. IPTV management software with WHMCS IPTV module.",
    noIndex: true,
  },
  "/order/success": {
    title: "Order Complete — Nexlify IPTV Reseller Panel",
    description:
      "Order confirmation for Nexlify IPTV reseller panel license. IPTV management software with WHMCS IPTV module.",
    noIndex: true,
  },
} as const satisfies Record<string, PageSeoEntry>;

export type SeoPagePath = keyof typeof SEO_PAGES;

export function pageSeo(path: SeoPagePath) {
  const entry = SEO_PAGES[path];
  return pageMetadata({
    title: entry.title,
    description: entry.description,
    path,
    keywords: "keywords" in entry ? entry.keywords : undefined,
    noIndex: "noIndex" in entry ? entry.noIndex : undefined,
    exactTitle: true,
    openGraph: "openGraph" in entry ? entry.openGraph : undefined,
  });
}
