import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "case-study-500-to-2000-lines";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

const TESTIMONIALS = [
  {
    quote:
      "Migrated from a legacy Xtream panel in one afternoon. WHMCS provisioning just works — GBP billing with no manual license CSVs.",
    name: "James R.",
    region: "Manchester, UK",
    lines: "850 → 1,400 lines",
  },
  {
    quote:
      "The demo sold us before checkout. Anti-Freeze and sub-second zapping cut our support tickets compared to our old panel stack.",
    name: "Marcus T.",
    region: "Texas, USA",
    lines: "1,200 lines",
  },
  {
    quote:
      "We run 2,000+ lines across sub-resellers. Nexlify's management tool and Telegram alerts when streams drop are worth the license alone.",
    name: "Elena V.",
    region: "Amsterdam · US clients",
    lines: "2,100 lines",
  },
] as const;

export default function CaseStudy500To2000Page() {
  return (
    <BlogArticleShell
      post={post}
      related={[
        { label: "WHMCS automation guide", href: "/blog/whmcs-iptv-automation-setup" },
        { label: "Features", href: "/features" },
        { label: "Pricing", href: "/pricing" },
      ]}
      sections={[
        {
          title: "Challenge: outgrow a legacy IPTV reseller panel",
          body: (
            <p>
              Operators scaling past ~500 lines often hit manual billing, unstable forks, and support load from
              buffering complaints. The goal: an <strong className="text-slate-200">IPTV management software</strong>{" "}
              stack with <strong className="text-slate-200">WHMCS IPTV automation</strong>, Anti-Freeze playback,
              and sub-reseller tooling — without rebuilding hierarchies from scratch.
            </p>
          ),
        },
        {
          title: "Results operators report",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Less time on license CSVs — WHMCS creates and renews keys automatically</li>
              <li>Fewer playback tickets — Anti-Freeze and failover URLs on unstable ISPs</li>
              <li>Faster cutover — preview migration from XUI.one / Xtream UI forks</li>
              <li>Better uptime visibility — Telegram alerts when streams or servers drop</li>
            </ul>
          ),
        },
        {
          title: "Operator voices",
          body: (
            <div className="space-y-4">
              {TESTIMONIALS.map((t) => (
                <blockquote key={t.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm text-slate-200">&ldquo;{t.quote}&rdquo;</p>
                  <footer className="mt-2 text-xs text-[var(--muted)]">
                    {t.name} · {t.region} · {t.lines}
                  </footer>
                </blockquote>
              ))}
            </div>
          ),
        },
        {
          title: "Replicate the playbook",
          body: (
            <p>
              Start a{" "}
              <Link href="/register?trial=1" className="text-violet-400 underline hover:text-violet-300">
                7-day trial
              </Link>
              , connect{" "}
              <Link href="/blog/whmcs-iptv-automation-setup" className="text-violet-400 underline hover:text-violet-300">
                WHMCS automation
              </Link>
              , and migrate with{" "}
              <Link href="/blog/migrate-xui-xtream-ui-to-nexlify" className="text-violet-400 underline hover:text-violet-300">
                built-in import
              </Link>
              . Use code <strong className="text-amber-300">NEXLIFY50</strong> for 50% off the first 3 months.
            </p>
          ),
        },
      ]}
    />
  );
}
