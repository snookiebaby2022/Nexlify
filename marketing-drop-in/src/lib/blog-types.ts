/** Shared blog post metadata shape for index, sitemap, and SEO. */
export type BlogPostMeta = {
  path: `/blog/${string}`;
  slug: string;
  tag: "Guide" | "Migration" | "Comparison" | "Tutorial" | "UK" | "Case study" | "Resource";
  listTitle: string;
  h1: string;
  eyebrow: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  datePublished: string;
  sitemapPriority: number;
};
