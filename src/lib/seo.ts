import type { Metadata } from "next";
import { ALL_BLOG_POSTS } from "@/lib/blog-registry";
import { absoluteMarketingUrl, DEFAULT_OG_IMAGE_ABSOLUTE, NEXLIFY_AUTHOR } from "@/lib/geo";
import { getLpGeoContent } from "@/lib/lp-geo-content";
import { DEFAULT_OG_IMAGE_PATH } from "@/lib/marketing-constants";
import { coreKeywordDescription, withCoreKeywords } from "@/lib/seo-keywords";
import { site } from "@/lib/site";

export const DEFAULT_DESCRIPTION = coreKeywordDescription(
  "Nexlify IPTV reseller panel and IPTV management software for worldwide operators — WHMCS IPTV module, Xtream-compatible stack, 7-day trial, and one-click VPS install.",
);

export const DEFAULT_KEYWORDS = withCoreKeywords([
  "IPTV panel",
  "best reseller panel",
  "IPTV reseller software",
  "Xtream panel",
  "service providers",
]);

export function seoTitle(mainKeyword: string): string {
  return `${mainKeyword} | ${site.name} — Worldwide`;
}

/** Absolute URL for a marketing route (no trailing slash except site root). */
export function pageUrl(path: string): string {
  const base = site.url.replace(/\/$/, "");
  return path === "/" ? `${base}/` : `${base}${path}`;
}

/** en-GB, en-US, and x-default hreflang alternates for Worldwide targeting. */
export function hreflangAlternates(path: string): NonNullable<Metadata["alternates"]> {
  const url = pageUrl(path);
  return {
    canonical: url,
    languages: {
      "en-GB": url,
      "en-US": url,
      "x-default": url,
    },
  };
}

export function pageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  keywords,
  noIndex = false,
  exactTitle = false,
  openGraph: openGraphOverride,
}: {
  title: string;
  description?: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
  /** Use title verbatim (no "| Nexlify — Worldwide" suffix). */
  exactTitle?: boolean;
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    publishedTime?: string;
    modifiedTime?: string;
  };
}): Metadata {
  const url = pageUrl(path);
  const absoluteTitle =
    exactTitle || title.includes("|") ? title : seoTitle(title);
  const ogTitle = openGraphOverride?.title ?? absoluteTitle;
  const ogDescription = openGraphOverride?.description ?? description;
  const ogImageUrl = openGraphOverride?.image ?? DEFAULT_OG_IMAGE_PATH;
  const absoluteOgImage = absoluteMarketingUrl(ogImageUrl);
  const ogImage = {
    url: absoluteOgImage,
    width: 1200,
    height: 630,
    alt: `${site.name} — Worldwide Resellers`,
    type: absoluteOgImage.includes("/opengraph-image") ? "image/png" : "image/jpeg",
  };

  const geo = getLpGeoContent(path);
  const publishedTime = openGraphOverride?.publishedTime ?? geo?.datePublished;
  const modifiedTime = openGraphOverride?.modifiedTime ?? geo?.dateModified;

  return {
    metadataBase: new URL(site.url),
    title: { absolute: absoluteTitle },
    description,
    keywords: withCoreKeywords(keywords ?? DEFAULT_KEYWORDS),
    alternates: hreflangAlternates(path),
    authors: geo
      ? [{ name: NEXLIFY_AUTHOR.name, url: NEXLIFY_AUTHOR.url }]
      : [{ name: site.name, url: site.url }],
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large" },
        },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url,
      siteName: site.name,
      locale: "en_US",
      alternateLocale: ["en_GB"],
      type: "website",
      images: [ogImage],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [absoluteOgImage],
      creator: "@nexlify",
      site: "@nexlify",
    },
  };
}

/** Public marketing routes included in sitemap.xml */
export const SITEMAP_PATHS: {
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
}[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/demo", priority: 0.95, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.95, changeFrequency: "weekly" },
  { path: "/features", priority: 0.8, changeFrequency: "monthly" },
  { path: "/install", priority: 0.9, changeFrequency: "monthly" },
  { path: "/docs/whmcs", priority: 0.85, changeFrequency: "monthly" },
  { path: "/requirements", priority: 0.75, changeFrequency: "monthly" },
  { path: "/help", priority: 0.7, changeFrequency: "monthly" },
  { path: "/updates", priority: 0.8, changeFrequency: "weekly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refund-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/register", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.35, changeFrequency: "yearly" },
  { path: "/compare/xtream-panel", priority: 0.75, changeFrequency: "monthly" },
  { path: "/compare/whmcs-iptv-module", priority: 0.75, changeFrequency: "monthly" },
  { path: "/vs/xui-one", priority: 0.7, changeFrequency: "monthly" },
  { path: "/vs/1-stream", priority: 0.7, changeFrequency: "monthly" },
  { path: "/lp/reseller-panel", priority: 0.7, changeFrequency: "monthly" },
  { path: "/lp/reseller-panel-uk", priority: 0.65, changeFrequency: "monthly" },
  { path: "/lp/whmcs-iptv", priority: 0.65, changeFrequency: "monthly" },
  { path: "/lp/live-tv-streaming-platform", priority: 0.72, changeFrequency: "monthly" },
  { path: "/lp/cut-the-cord-streaming", priority: 0.7, changeFrequency: "monthly" },
  { path: "/affiliates", priority: 0.5, changeFrequency: "monthly" },
  { path: "/brand", priority: 0.4, changeFrequency: "yearly" },
  { path: "/status", priority: 0.3, changeFrequency: "weekly" },
  { path: "/livestream", priority: 0.7, changeFrequency: "weekly" },
  { path: "/whmcs", priority: 0.85, changeFrequency: "monthly" },
  { path: "/best-iptv-reseller-panel", priority: 0.8, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.65, changeFrequency: "weekly" },
  ...ALL_BLOG_POSTS.map(({ path, sitemapPriority }) => ({
    path,
    priority: sitemapPriority,
    changeFrequency: "monthly" as const,
  })),
];
