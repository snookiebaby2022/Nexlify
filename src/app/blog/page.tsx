import Link from "next/link";

import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";

import { LeadMagnetSignup } from "@/components/LeadMagnetSignup";

import { WebPageJsonLd } from "@/components/WebPageJsonLd";

import { ALL_BLOG_POSTS } from "@/lib/blog-registry";

import { pageSeo } from "@/lib/seo-pages";



export const metadata = pageSeo("/blog");



const RELATED_RESOURCES = [

  {

    title: "Nexlify vs 1-stream",

    href: "/vs/1-stream",

    excerpt: "Built-in migration, WHMCS automation, and modern reseller tooling compared.",

    tag: "Comparison",

  },

  {

    title: "Nexlify vs XUI.one",

    href: "/vs/xui-one",

    excerpt: "Why operators switch from XUI-style panels to Nexlify management software.",

    tag: "Comparison",

  },

  {

    title: "Best IPTV reseller panel hub",

    href: "/best-iptv-reseller-panel",

    excerpt: "Honest comparison: Nexlify vs Xtream UI, XUI.one, and Ministra.",

    tag: "Comparison",

  },

  {

    title: "WHMCS IPTV module docs",

    href: "/docs/whmcs",

    excerpt: "Connect GBP billing and auto-provision licenses on new orders.",

    tag: "Guide",

  },

  {

    title: "One-click Xtream panel installer",

    href: "/install",

    excerpt: "Deploy on Ubuntu or Debian VPS with SSL, PM2, and PostgreSQL.",

    tag: "Tutorial",

  },

] as const;



export default function BlogPage() {

  return (

    <div className="mesh-bg min-h-screen">

      <BreadcrumbJsonLd

        items={[

          { name: "Home", path: "/" },

          { name: "Blog", path: "/blog" },

        ]}

      />

      <WebPageJsonLd

        path="/blog"

        name="IPTV Reseller Blog — Guides & Operator Tips"

        description="IPTV reseller guides, WHMCS setup tips, and operator playbooks for worldwide service providers."

        about="Blog"

      />



      <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">

        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">

          Operator resources

        </p>

        <h1 className="font-display mt-2 text-3xl font-bold text-white sm:text-4xl md:text-5xl">

          IPTV reseller blog &amp; guides

        </h1>

        <p className="mt-4 max-w-2xl text-[var(--muted)]">

          Playbooks for becoming a reseller — WHMCS automation, panel migration, Anti-Freeze streaming, and

          growth tips for worldwide operators.

        </p>



        <div className="mt-12">

          <LeadMagnetSignup />

        </div>



        <section className="mt-16">

          <h2 className="font-display text-xl font-semibold text-white">Articles &amp; guides</h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">

            {ALL_BLOG_POSTS.map((post) => (

              <Link

                key={post.path}

                href={post.path}

                className="glass block rounded-2xl p-5 transition-colors hover:border-violet-500/30"

              >

                <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">

                  {post.tag}

                </span>

                <h3 className="mt-2 font-semibold text-violet-200">{post.listTitle}</h3>

                <p className="mt-2 text-xs text-[var(--muted)]">{post.excerpt}</p>

              </Link>

            ))}

          </div>

        </section>



        <section className="mt-16">

          <h2 className="font-display text-xl font-semibold text-white">Related product pages</h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">

            {RELATED_RESOURCES.map((item) => (

              <Link

                key={item.href}

                href={item.href}

                className="glass block rounded-2xl p-5 transition-colors hover:border-violet-500/30"

              >

                <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">

                  {item.tag}

                </span>

                <h3 className="mt-2 font-semibold text-violet-200">{item.title}</h3>

                <p className="mt-2 text-xs text-[var(--muted)]">{item.excerpt}</p>

              </Link>

            ))}

          </div>

        </section>



        <p className="mt-12 text-center text-sm text-[var(--muted)]">

          More on{" "}

          <Link href="/updates" className="text-violet-400 hover:text-violet-300 underline">

            panel updates

          </Link>

          {" · "}

          <Link href="/help" className="text-violet-400 hover:text-violet-300 underline">

            Help &amp; FAQ

          </Link>

        </p>

      </div>

    </div>

  );

}


