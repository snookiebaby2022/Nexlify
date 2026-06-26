import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { pageMetadata, pageUrl } from "@/lib/seo";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/brand");



export default function BrandPage() {
  const ogImage = pageUrl("/opengraph-image");

  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Brand kit", path: "/brand" },
        ]}
      />
      <WebPageJsonLd path="/brand" name="Nexlify brand kit" description="Download Nexlify logos, colors, and press assets for worldwide IPTV reseller marketing." about="Brand" />

      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">Press</p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">Brand kit</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Assets and copy for partners, affiliates, and media covering IPTV panel software worldwide.
        </p>
        <section className="mt-10 space-y-6">
          <div className="glass rounded-2xl p-6">
            <h2 className="font-semibold text-white">Product name</h2>
            <p className="mt-2 text-sm text-slate-300">{site.name} IPTV Panel</p>
          </div>
          <div className="glass rounded-2xl p-6">
            <h2 className="font-semibold text-white">Short description</h2>
            <p className="mt-2 text-sm text-slate-300">
              Nexlify is IPTV reseller and management software for resellers — WHMCS billing, live
              demo, GBP/USD worldwide checkout. We do not host, stream, or distribute TV content.
            </p>
          </div>
          <div className="glass rounded-2xl p-6">
            <h2 className="font-semibold text-white">Social share image</h2>
            <p className="mt-2 text-sm text-slate-300">
              <a href={ogImage} className="text-violet-400 underline">
                {ogImage}
              </a>{" "}
              (1200×630)
            </p>
          </div>
          <div className="glass rounded-2xl p-6">
            <h2 className="font-semibold text-white">Key links</h2>
            <ul className="mt-2 space-y-1 text-sm text-violet-300">
              <li>
                <Link href="/demo">Live demo</Link>
              </li>
              <li>
                <Link href="/pricing">Pricing</Link>
              </li>
              <li>
                <Link href="/features">Features</Link>
              </li>
            </ul>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Press enquiries:{" "}
            <a href={`mailto:${site.salesEmail}`} className="text-violet-400">
              {site.salesEmail}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
