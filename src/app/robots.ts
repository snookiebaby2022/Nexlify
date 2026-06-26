import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

const DISALLOW = ["/admin/", "/dashboard/", "/api/", "/checkout/", "/order/", "/support/", "/login"];

/** Crawlers that must reach marketing content for GEO / Common Crawl / AI citation. */
const AI_AND_ARCHIVE_BOTS = [
  "CCBot",
  "GPTBot",
  "Google-Extended",
  "anthropic-ai",
  "ClaudeBot",
  "PerplexityBot",
  "Bytespider",
  "Applebot-Extended",
] as const;

export default function robots(): MetadataRoute.Robots {
  const base = site.url.replace(/\/$/, "");

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_AND_ARCHIVE_BOTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
