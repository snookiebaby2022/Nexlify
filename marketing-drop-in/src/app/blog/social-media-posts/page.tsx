import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { PROBLEM_SOLUTION_POSTS } from "@/lib/problem-solution-posts";
import { pageMetadata } from "@/lib/seo";
import { withCoreKeywords } from "@/lib/seo-keywords";

const PATH = "/blog/social-media-posts";

export const metadata = pageMetadata({
  title: "Social Media Posts — Copy & Paste for IPTV Operators | Nexlify",
  description:
    "10 ready-to-post social captions for Facebook, Telegram, Reddit, LinkedIn, and X — IPTV reseller panel problems and Nexlify solutions.",
  path: PATH,
  keywords: withCoreKeywords(["IPTV social media", "reseller marketing"]),
  exactTitle: true,
  noIndex: true,
});

export default function SocialMediaPostsPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: "Social media posts", path: PATH },
        ]}
      />
      <WebPageJsonLd
        path={PATH}
        name="Social media posts for IPTV operators"
        description="Copy-paste social captions matching Nexlify problem/solution blog guides."
        about="Social media"
      />

      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          Copy &amp; paste · 10 posts
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          Social media posts for IPTV operators
        </h1>
        <p className="mt-4 text-[var(--muted)]">
          Use on Facebook, Telegram, Reddit, LinkedIn, or X. Each matches a blog guide on{" "}
          <Link href="/blog" className="text-violet-400 underline">
            nexlify.live/blog
          </Link>
          .
        </p>

        <div className="mt-8">
          <TrialCtaButton trackLabel="social_kit" size="sm" />
        </div>

        <div className="mt-12 space-y-8">
          {PROBLEM_SOLUTION_POSTS.map((post, index) => (
            <article key={post.slug} className="glass rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                Post {index + 1} ·{" "}
                <Link href={post.path} className="underline hover:text-violet-300">
                  {post.listTitle}
                </Link>
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-sm leading-relaxed text-slate-200">
                {post.socialPost}
                {"\n\n"}
                {post.socialTags}
              </pre>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
