import Link from "next/link";
import { BlogResourceLinks } from "@/components/BlogResourceLinks";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { blogPostMetadata } from "@/lib/blog-metadata";
import type { ProblemSolutionPost } from "@/lib/problem-solution-posts";
import { pageUrl } from "@/lib/seo";

type ProblemSolutionBlogPageProps = {
  post: ProblemSolutionPost;
};

function ArticleJsonLd({ post }: { post: ProblemSolutionPost }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.h1,
    description: post.excerpt,
    url: pageUrl(post.path),
    datePublished: post.datePublished,
    author: { "@type": "Organization", name: "Nexlify" },
    publisher: { "@type": "Organization", name: "Nexlify" },
    keywords: post.keywords.join(", "),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

export function ProblemSolutionBlogPage({ post }: ProblemSolutionBlogPageProps) {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.listTitle, path: post.path },
        ]}
      />
      <WebPageJsonLd path={post.path} name={post.h1} description={post.excerpt} about={post.tag} />
      <SoftwareProductJsonLd path={post.path} description={post.excerpt} />
      <ArticleJsonLd post={post} />

      <article className="mx-auto max-w-3xl min-w-0 px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">{post.eyebrow}</p>
        <h1 className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl md:text-4xl">{post.h1}</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-300 md:text-base">{post.intro}</p>

        <div className="mt-8">
          <TrialCtaButton trackLabel={`problem_${post.slug}`} />
        </div>

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold text-white">{post.whyTitle}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300 md:text-base">
            {post.whyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6">
          <h2 className="font-display text-xl font-semibold text-emerald-100">{post.solutionTitle}</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-200 md:text-base">
            {post.solutionPoints.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="text-emerald-400 shrink-0">✅</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-base font-medium text-white">
          {post.ctaText}{" "}
          <Link href={post.ctaHref} className="text-violet-400 underline hover:text-violet-300">
            {post.ctaHref.startsWith("/") ? "Get started →" : "Learn more →"}
          </Link>
        </p>

        <BlogResourceLinks />

        <ContentDisclaimer className="mt-10" />

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          <Link href="/blog/social-media-posts" className="text-violet-400 underline hover:text-violet-300">
            Copy social post for this topic
          </Link>
          {" · "}
          <Link href="/blog" className="text-violet-400 underline hover:text-violet-300">
            All guides
          </Link>
        </p>
      </article>
    </div>
  );
}

export function problemSolutionMetadata(post: ProblemSolutionPost) {
  return blogPostMetadata(post);
}
