import type { MetadataRoute } from "next";
import { getLpGeoContent } from "@/lib/lp-geo-content";
import { pageUrl, SITEMAP_PATHS } from "@/lib/seo";

function sitemapLanguages(path: string): Record<string, string> {
  const url = pageUrl(path);
  return {
    "en-GB": url,
    "en-US": url,
    "x-default": url,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map(({ path, priority, changeFrequency }) => {
    const geo = getLpGeoContent(path);
    return {
      url: pageUrl(path),
      lastModified: geo ? new Date(geo.dateModified) : new Date(),
      changeFrequency,
      priority,
      alternates: { languages: sitemapLanguages(path) },
    };
  });
}
