import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "xui-one-vs-nexlify-full-comparison";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

const ROWS = [
  ["WHMCS IPTV module", "Native — auto keys, renewals, suspend", "Third-party scripts / manual"],
  ["Anti-Freeze playback", "Included", "Rare on forks"],
  ["Security (2FA, leak audit, geo-block)", "Built-in", "Varies / partial"],
  ["XUI.one migration", "Preview import built-in", "N/A"],
  ["Support", "In-panel tickets + docs", "Community forums"],
  ["Stack", "Node + PostgreSQL + PM2", "Legacy PHP"],
  ["Pricing", "From £50/mo · 7-day trial", "Variable / fork-dependent"],
  ["Performance", "Sub-second zapping target", "Depends on fork/host"],
] as const;

export default function XuiOneVsNexlifyFullComparisonPage() {
  return (
    <BlogArticleShell
      post={post}
      related={[
        { label: "Pricing comparison", href: "/blog/xui-one-vs-nexlify-pricing" },
        { label: "vs XUI.one page", href: "/vs/xui-one" },
        { label: "All panels compared", href: "/best-iptv-reseller-panel" },
      ]}
      sections={[
        {
          title: "Why operators search XUI.one vs Nexlify",
          body: (
            <p>
              XUI.one has a large installed base, but growing resellers hit walls on WHMCS sync, migration
              risk, and unmaintained forks. Nexlify is the modern{" "}
              <strong className="text-slate-200">IPTV management software</strong> alternative — a maintained{" "}
              <strong className="text-slate-200">IPTV reseller panel</strong> with native{" "}
              <strong className="text-slate-200">WHMCS IPTV module</strong> automation.
            </p>
          ),
        },
        {
          title: "Full feature comparison",
          body: (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-3 text-slate-200">Area</th>
                    <th className="py-2 pr-3 text-violet-300">Nexlify</th>
                    <th className="py-2 text-[var(--muted)]">XUI.one (typical)</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(([area, nexlify, xui]) => (
                    <tr key={area} className="border-b border-white/5">
                      <td className="py-2.5 pr-3 font-medium text-slate-200">{area}</td>
                      <td className="py-2.5 pr-3 text-emerald-300/90">{nexlify}</td>
                      <td className="py-2.5 text-[var(--muted)]">{xui}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          title: "Nexlify advantages in detail",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-slate-200">WHMCS integration</strong> — license lifecycle on payment,
                not spreadsheets
              </li>
              <li>
                <strong className="text-slate-200">Security</strong> — enforce 2FA, geo-blocking, playback
                token TTL, leak audit logs
              </li>
              <li>
                <strong className="text-slate-200">Anti-Freeze</strong> — reduce subscriber buffering vs legacy
                stacks
              </li>
              <li>
                <strong className="text-slate-200">Support</strong> — documentation, migration guides, in-panel
                tickets
              </li>
            </ul>
          ),
        },
        {
          title: "Next steps",
          body: (
            <p>
              Compare live on{" "}
              <Link href="/pricing" className="text-violet-400 underline hover:text-violet-300">
                pricing
              </Link>
              , read{" "}
              <Link href="/blog/migrate-xui-xtream-ui-to-nexlify" className="text-violet-400 underline hover:text-violet-300">
                migration steps
              </Link>
              , or open the{" "}
              <Link href="/demo" className="text-violet-400 underline hover:text-violet-300">
                demo
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
