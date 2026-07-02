import type { Metadata } from "next";
import type { BlogPostMeta } from "@/lib/blog-types";
import { withCoreKeywords } from "@/lib/seo-keywords";
import { pageMetadata } from "@/lib/seo";

export function blogPostMetadata(post: BlogPostMeta): Metadata {
  return pageMetadata({
    title: post.seoTitle,
    description: post.seoDescription,
    path: post.path,
    keywords: withCoreKeywords(post.keywords),
    exactTitle: true,
  });
}
