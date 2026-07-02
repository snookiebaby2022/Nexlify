import { problemPostsForRegistry } from "@/lib/problem-solution-posts";
import type { BlogPostMeta } from "@/lib/blog-types";

export type { BlogPostMeta };

/** Legacy post — metadata mirrors seo-pages entry; page uses custom layout. */
export const LEGACY_BLOG_POST: BlogPostMeta = {
  path: "/blog/migrate-from-xui-or-1-stream",
  slug: "migrate-from-xui-or-1-stream",
  tag: "Migration",
  listTitle: "Migrate from XUI.one",
  h1: "How to migrate from XUI.one to Nexlify",
  eyebrow: "Migration guide · 2026",
  excerpt: "Step-by-step checklist — preview import, WHMCS, DNS cutover, and testing.",
  seoTitle: "Migrate XUI.one → IPTV Reseller Panel",
  seoDescription:
    "Step-by-step migration from XUI.one to Nexlify IPTV reseller panel. WHMCS IPTV module setup, preview import, and IPTV management software.",
  keywords: ["XUI migration"],
  datePublished: "2026-05-28",
  sitemapPriority: 0.75,
};

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    path: "/blog/best-iptv-reseller-panel-2026",
    slug: "best-iptv-reseller-panel-2026",
    tag: "Guide",
    listTitle: "How to choose the best IPTV reseller panel",
    h1: "How to choose the best IPTV reseller panel in 2026",
    eyebrow: "Buyer's guide · 2026",
    excerpt:
      "Security, billing, Anti-Freeze, and migration — what features matter when choosing IPTV management software. Nexlify vs legacy XUI.one panels.",
    seoTitle: "How to Choose the Best IPTV Reseller Panel 2026 | Nexlify",
    seoDescription:
      "Best IPTV reseller panel in 2026: compare WHMCS IPTV module, IPTV management software stacks, migration, and pricing before you switch.",
    keywords: ["best iptv reseller panel", "IPTV panel comparison"],
    datePublished: "2026-06-04",
    sitemapPriority: 0.8,
  },
  {
    path: "/blog/whmcs-iptv-automation-setup",
    slug: "whmcs-iptv-automation-setup",
    tag: "Tutorial",
    listTitle: "WHMCS + IPTV automation",
    h1: "WHMCS + IPTV: how to automate your entire business",
    eyebrow: "WHMCS · Billing automation",
    excerpt:
      "Auto-provision IPTV panel licenses, handle renewals and suspensions, and run GBP/USD checkout — your biggest operator advantage.",
    seoTitle: "WHMCS + IPTV: Automate Your IPTV Business | Nexlify",
    seoDescription:
      "WHMCS IPTV automation for IPTV reseller panel licenses. IPTV management software with auto-keys, renewals, and GBP/USD checkout.",
    keywords: ["WHMCS IPTV automation", "WHMCS IPTV module"],
    datePublished: "2026-06-06",
    sitemapPriority: 0.78,
  },
  {
    path: "/blog/migrate-xui-one-to-nexlify",
    slug: "migrate-xui-one-to-nexlify",
    tag: "Migration",
    listTitle: "Migrate from XUI.one to Nexlify",
    h1: "Migrate from XUI.one to Nexlify — focused cutover plan",
    eyebrow: "XUI.one · Migration",
    excerpt:
      "XUI-specific migration: preview import, parallel run, WHMCS sync, and DNS cutover without losing resellers.",
    seoTitle: "Migrate from XUI.one to Nexlify — Step-by-Step | Nexlify",
    seoDescription:
      "Migrate from XUI.one to Nexlify IPTV reseller panel. WHMCS IPTV module setup, preview import, and IPTV management software cutover.",
    keywords: ["migrate XUI.one", "XUI alternative"],
    datePublished: "2026-06-09",
    sitemapPriority: 0.78,
  },
  {
    path: "/blog/anti-freeze-iptv-panel-explained",
    slug: "anti-freeze-iptv-panel-explained",
    tag: "Guide",
    listTitle: "Anti-Freeze IPTV panel explained",
    h1: "Anti-Freeze IPTV panel — how Nexlify reduces buffering for subscribers",
    eyebrow: "Streaming · Anti-Freeze",
    excerpt:
      "What Anti-Freeze playback does, when operators enable it, and how it differs from legacy panel buffering fixes.",
    seoTitle: "Anti-Freeze IPTV Panel Explained | Nexlify",
    seoDescription:
      "Anti-Freeze IPTV panel playback in Nexlify IPTV management software. Reduce buffering for lines on your IPTV reseller panel.",
    keywords: ["Anti-Freeze IPTV", "IPTV panel streaming"],
    datePublished: "2026-06-11",
    sitemapPriority: 0.72,
  },
  {
    path: "/blog/iptv-management-software-buyers-guide",
    slug: "iptv-management-software-buyers-guide",
    tag: "Guide",
    listTitle: "IPTV management software buyer's guide",
    h1: "IPTV management software — buyer's guide for resellers",
    eyebrow: "Software · Buyer's guide",
    excerpt:
      "Stack, billing, reseller hierarchy, migration, and support — what to demand from IPTV management software in 2026.",
    seoTitle: "IPTV Management Software Buyer's Guide 2026 | Nexlify",
    seoDescription:
      "IPTV management software buyer's guide: WHMCS IPTV module, IPTV reseller panel features, migration, and VPS requirements.",
    keywords: ["IPTV management software", "IPTV reseller software"],
    datePublished: "2026-06-13",
    sitemapPriority: 0.78,
  },
  {
    path: "/blog/iptv-reseller-software-uk",
    slug: "iptv-reseller-software-uk",
    tag: "UK",
    listTitle: "IPTV reseller software UK",
    h1: "IPTV reseller software UK — GBP billing, WHMCS, and compliance basics",
    eyebrow: "UK · Resellers",
    excerpt:
      "British operators: GBP checkout, WHMCS IPTV module, trial terms, and software-only positioning for UK resellers.",
    seoTitle: "IPTV Reseller Software UK — GBP & WHMCS | Nexlify",
    seoDescription:
      "IPTV reseller software UK: Nexlify IPTV reseller panel with GBP billing, WHMCS IPTV module, and IPTV management software for British operators.",
    keywords: ["IPTV reseller software UK", "UK IPTV panel"],
    datePublished: "2026-06-16",
    sitemapPriority: 0.75,
  },
  {
    path: "/blog/xui-one-vs-nexlify-pricing",
    slug: "xui-one-vs-nexlify-pricing",
    tag: "Comparison",
    listTitle: "XUI.one vs Nexlify pricing",
    h1: "XUI.one vs Nexlify pricing — license cost and hidden operator spend",
    eyebrow: "Pricing · Comparison",
    excerpt:
      "Compare monthly license tiers, WHMCS inclusion, migration tooling, and support model vs XUI.one forks.",
    seoTitle: "XUI.one vs Nexlify Pricing Comparison | Nexlify",
    seoDescription:
      "XUI.one vs Nexlify pricing for IPTV reseller panel operators. WHMCS IPTV module included — IPTV management software from £50/mo.",
    keywords: ["XUI.one pricing", "IPTV panel pricing"],
    datePublished: "2026-06-18",
    sitemapPriority: 0.76,
  },
  {
    path: "/blog/xtream-panel-vs-modern-iptv-stack",
    slug: "xtream-panel-vs-modern-iptv-stack",
    tag: "Comparison",
    listTitle: "Xtream panel vs modern IPTV stack",
    h1: "Xtream panel vs modern IPTV stack — PHP forks vs Node + PostgreSQL",
    eyebrow: "Architecture · 2026",
    excerpt:
      "Why operators outgrow generic Xtream UI forks and what a maintained IPTV management software stack looks like.",
    seoTitle: "Xtream Panel vs Modern IPTV Stack | Nexlify",
    seoDescription:
      "Xtream panel vs modern IPTV management software. Nexlify IPTV reseller panel with WHMCS IPTV module on Node + PostgreSQL.",
    keywords: ["Xtream panel", "IPTV panel stack"],
    datePublished: "2026-06-23",
    sitemapPriority: 0.72,
  },
  {
    path: "/blog/xui-one-vs-nexlify-full-comparison",
    slug: "xui-one-vs-nexlify-full-comparison",
    tag: "Comparison",
    listTitle: "XUI.one vs Nexlify — full comparison",
    h1: "XUI.one vs Nexlify: full comparison (features, pricing, performance)",
    eyebrow: "Comparison · XUI.one alternative",
    excerpt:
      "Direct comparison: WHMCS integration, security, Anti-Freeze, migration, support, and pricing vs XUI.one forks.",
    seoTitle: "XUI.one vs Nexlify: Full Comparison 2026 | Nexlify",
    seoDescription:
      "XUI.one vs Nexlify IPTV reseller panel — WHMCS IPTV module, Anti-Freeze, security, migration, pricing, and IPTV management software compared.",
    keywords: ["XUI.one vs Nexlify", "XUI alternative"],
    datePublished: "2026-06-25",
    sitemapPriority: 0.82,
  },
  {
    path: "/blog/migrate-xui-xtream-ui-to-nexlify",
    slug: "migrate-xui-xtream-ui-to-nexlify",
    tag: "Migration",
    listTitle: "Migrate XUI / Xtream UI to Nexlify",
    h1: "How to migrate from XUI / Xtream UI to Nexlify (step-by-step)",
    eyebrow: "Migration · Built-in tool",
    excerpt:
      "Use Nexlify's built-in panel migration with preview import — step-by-step cutover from XUI.one and Xtream UI forks.",
    seoTitle: "Migrate XUI / Xtream UI to Nexlify — Step-by-Step | Nexlify",
    seoDescription:
      "Migrate from XUI.one or Xtream UI to Nexlify IPTV reseller panel. Built-in migration tool, WHMCS IPTV module, IPTV management software guide.",
    keywords: ["Xtream UI migration", "XUI migration"],
    datePublished: "2026-06-27",
    sitemapPriority: 0.78,
  },
  {
    path: "/blog/case-study-500-to-2000-lines",
    slug: "case-study-500-to-2000-lines",
    tag: "Case study",
    listTitle: "Case study: 500 → 2,000 lines",
    h1: "How an operator grew from 500 to 2,000 lines using Nexlify",
    eyebrow: "Case study · Real operators",
    excerpt:
      "Less support work, automated WHMCS billing, better uptime — results from Manchester, Texas, and Amsterdam operators.",
    seoTitle: "Case Study: 500 to 2,000 Lines with Nexlify | Nexlify",
    seoDescription:
      "IPTV reseller panel case study: grow lines with Nexlify IPTV management software, WHMCS IPTV module automation, and Anti-Freeze playback.",
    keywords: ["IPTV reseller case study", "IPTV panel growth"],
    datePublished: "2026-06-29",
    sitemapPriority: 0.74,
  },
  {
    path: "/blog/10-features-every-iptv-panel-must-have",
    slug: "10-features-every-iptv-panel-must-have",
    tag: "Resource",
    listTitle: "10 features every IPTV panel must have",
    h1: "10 features every good IPTV panel must have",
    eyebrow: "Infographic · Checklist",
    excerpt:
      "Anti-Freeze, fast zapping, reseller credits, geo-blocking, WHMCS, security, migration, and more — visual checklist for operators.",
    seoTitle: "10 Features Every IPTV Panel Must Have | Nexlify",
    seoDescription:
      "Infographic checklist: Anti-Freeze, WHMCS IPTV module, security, migration, and IPTV management software features every IPTV reseller panel needs.",
    keywords: ["IPTV panel features", "best iptv reseller panel"],
    datePublished: "2026-07-01",
    sitemapPriority: 0.73,
  },
];

/** All blog articles for index and sitemap (newest first). */
export const ALL_BLOG_POSTS: BlogPostMeta[] = [
  LEGACY_BLOG_POST,
  ...BLOG_POSTS,
  ...problemPostsForRegistry(),
].sort((a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime());

export const BLOG_POST_PATHS = ALL_BLOG_POSTS.map((p) => p.path);

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return (
    BLOG_POSTS.find((p) => p.slug === slug) ??
    problemPostsForRegistry().find((p) => p.slug === slug)
  );
}
