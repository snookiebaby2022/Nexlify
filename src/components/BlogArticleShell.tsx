import Link from "next/link";
import type { ReactNode } from "react";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { BlogResourceLinks } from "@/components/BlogResourceLinks";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import type { BlogPostMeta } from "@/lib/blog-types";
import { pageUrl } from "@/lib/seo";

export type BlogSection = {
  id?: string;
  title: string;
  body: ReactNode;
};

type BlogArticleShellProps = {
  post: BlogPostMeta;
  sections: BlogSection[];
  ctaSecondary?: { label: string; href: string; external?: boolean }[];
  related?: { label: string; href: string }[];
  howToSteps?: { name: string; text: string }[];
};

function ArticleJsonLd({ post }: { post: BlogPostMeta }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.h1,
    description: post.excerpt,
    url: pageUrl(post.path),
    datePublished: post.datePublished,
    dateModified: post.datePublished,
    inLanguage: ["en-GB", "en-US"],
    author: { "@type": "Organization", name: "Nexlify", url: "https://nexlify.live" },
    publisher: {
      "@type": "Organization",
      name: "Nexlify",
      url: "https://nexlify.live",
    },
    mainEntityOfPage: pageUrl(post.path),
    keywords: post.keywords.join(", "),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

function HowToJsonLd({ post, steps }: { post: BlogPostMeta; steps: { name: string; text: string }[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: post.h1,
    description: post.excerpt,
    url: pageUrl(post.path),
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}

export function BlogArticleShell({
  post,
  sections,
  ctaSecondary = [
    { label: "View pricing", href: "/pricing" },
    { label: "Try live demo", href: "https://panel.demo.nexlify.live", external: true },
  ],
  related,
  howToSteps,
}: BlogArticleShellProps) {
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
      {howToSteps && howToSteps.length > 0 && <HowToJsonLd post={post} steps={howToSteps} />}

      <article className="mx-auto max-w-3xl min-w-0 px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">{post.eyebrow}</p>
        <h1 className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl md:text-4xl">{post.h1}</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">{post.excerpt}</p>
        <time className="mt-2 block text-xs text-[var(--muted)]" dateTime={post.datePublished}>
          Published {new Date(post.datePublished).toLocaleDateString("en-GB", { dateStyle: "long" })}
        </time>

        <div className="mt-8 flex flex-col items-center gap-4">
          <TrialCtaButton trackLabel={`blog_${post.slug}`} />
          {ctaSecondary.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              {ctaSecondary.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 underline hover:text-violet-300"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href} className="text-violet-400 underline hover:text-violet-300">
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          )}
        </div>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title} id={section.id}>
              <h2 className="font-display text-lg font-semibold text-white sm:text-xl">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300 md:text-base">{section.body}</div>
            </section>
          ))}
        </div>

        {related && related.length > 0 && (
          <p className="mt-12 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span className="text-[var(--muted)]">Related:</span>
            {related.map((link, i) => (
              <span key={link.href}>
                {i > 0 && <span className="text-[var(--muted)]"> · </span>}
                <Link href={link.href} className="text-violet-400 underline hover:text-violet-300">
                  {link.label}
                </Link>
              </span>
            ))}
          </p>
        )}

        <BlogResourceLinks />

        <ContentDisclaimer className="mt-10" />

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          <Link href="/blog" className="text-violet-400 underline hover:text-violet-300">
            All guides
          </Link>
          {" · "}
          <Link href="/help" className="text-violet-400 underline hover:text-violet-300">
            Help &amp; FAQ
          </Link>
        </p>
      </article>
    </div>
  );
}
