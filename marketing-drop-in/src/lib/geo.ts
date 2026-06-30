import { DEFAULT_OG_IMAGE_PATH } from "@/lib/marketing-constants";
import { pageUrl } from "@/lib/seo";
import {
  buildProductSchema,
  buildSoftwareApplicationSchema,
} from "@/lib/software-schema";
import { site } from "@/lib/site";

export const NEXLIFY_AUTHOR = {
  name: "Nexlify Product Team",
  url: site.url,
  jobTitle: "IPTV platform documentation",
} as const;

export type GeoFaqItem = { question: string; answer: string };

export type LpGeoContent = {
  definition: string;
  datePublished: string;
  dateModified: string;
  faq: GeoFaqItem[];
};

/** Absolute URL for OG images and schema (crawlers require full URLs). */
export function absoluteMarketingUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  const base = site.url.replace(/\/$/, "");
  return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

export const DEFAULT_OG_IMAGE_ABSOLUTE = absoluteMarketingUrl(DEFAULT_OG_IMAGE_PATH);

export function buildLpJsonLdGraph(options: {
  path: string;
  name: string;
  description: string;
  definition: string;
  about: string;
  datePublished: string;
  dateModified: string;
  faq: GeoFaqItem[];
  includeProduct?: boolean;
}) {
  const url = pageUrl(options.path);
  const authorId = `${url}#author`;
  const orgId = `${site.url}#organization`;
  const websiteId = `${site.url}#website`;
  const softwareId = `${url}#software`;

  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": orgId,
      name: site.name,
      url: site.url,
      email: site.supportEmail,
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: site.name,
      url: site.url,
      publisher: { "@id": orgId },
      inLanguage: ["en-GB", "en-US"],
    },
    {
      "@type": "Person",
      "@id": authorId,
      name: NEXLIFY_AUTHOR.name,
      url: NEXLIFY_AUTHOR.url,
      jobTitle: NEXLIFY_AUTHOR.jobTitle,
      worksFor: { "@id": orgId },
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: options.name,
      description: options.description,
      datePublished: options.datePublished,
      dateModified: options.dateModified,
      inLanguage: "en",
      isPartOf: { "@id": websiteId },
      author: { "@id": authorId },
      about: { "@type": "Thing", name: options.about },
      mainEntity: { "@id": softwareId },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: DEFAULT_OG_IMAGE_ABSOLUTE,
        width: 1200,
        height: 630,
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: pageUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: options.about,
          item: url,
        },
      ],
    },
    {
      ...buildSoftwareApplicationSchema({
        name: options.name,
        description: options.definition,
        url,
      }),
      "@id": softwareId,
    },
    {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      url,
      mainEntity: options.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ];

  if (options.includeProduct) {
    graph.push(
      buildProductSchema({
        name: options.name,
        description: options.definition,
        url,
      }),
    );
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function formatFreshnessLabel(dateModified: string): string {
  return new Date(dateModified).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
