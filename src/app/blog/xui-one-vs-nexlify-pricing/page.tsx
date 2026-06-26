import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "xui-one-vs-nexlify-pricing";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

export default function XuiOneVsNexlifyPricingPage() {
  return (
    <BlogArticleShell
      post={post}
      ctaSecondary={[{ label: "Compare pricing live", href: "/pricing" }]}
      related={[
        { label: "vs XUI.one", href: "/vs/xui-one" },
        { label: "Migration guide", href: "/blog/migrate-xui-one-to-nexlify" },
        { label: "Best panel 2026", href: "/blog/best-iptv-reseller-panel-2026" },
      ]}
      sections={[
        {
          title: "XUI.one vs Nexlify pricing at a glance",
          body: (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4 text-slate-200">Item</th>
                    <th className="py-2 pr-4 text-violet-300">Nexlify</th>
                    <th className="py-2 text-[var(--muted)]">XUI.one (typical)</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4">License from</td>
                    <td className="py-2 pr-4">£50/mo Starter</td>
                    <td className="py-2">Varies / community forks</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4">WHMCS IPTV module</td>
                    <td className="py-2 pr-4">Included</td>
                    <td className="py-2">Often third-party / custom</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4">7-day trial</td>
                    <td className="py-2 pr-4">Yes</td>
                    <td className="py-2">Rare</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Built-in XUI migration</td>
                    <td className="py-2 pr-4">Preview import</td>
                    <td className="py-2">N/A</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ),
        },
        {
          title: "Hidden costs on legacy panels",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Custom WHMCS bridge development and maintenance</li>
              <li>Security patches on unmaintained PHP forks</li>
              <li>Manual license spreadsheets and support load</li>
              <li>Downtime during risky live imports without preview</li>
            </ul>
          ),
        },
        {
          title: "Nexlify license tiers",
          body: (
            <p>
              Starter, Main, and Top Tier scale with line counts — every tier includes the WHMCS IPTV module and
              IPTV management software stack. See live GBP/USD numbers on{" "}
              <Link href="/pricing" className="text-violet-400 underline hover:text-violet-300">
                pricing
              </Link>{" "}
              and the side-by-side table on{" "}
              <Link href="/vs/xui-one" className="text-violet-400 underline hover:text-violet-300">
                Nexlify vs XUI.one
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
