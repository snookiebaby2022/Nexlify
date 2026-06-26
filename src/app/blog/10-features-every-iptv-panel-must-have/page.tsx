import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "10-features-every-iptv-panel-must-have";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

const FEATURES = [
  { n: 1, title: "WHMCS IPTV module", desc: "Auto-provision, renew, suspend, and revoke license keys on payment." },
  { n: 2, title: "Anti-Freeze playback", desc: "Reduce visible buffering on residential and mobile lines." },
  { n: 3, title: "Fast zapping", desc: "Sub-second channel changes keep subscribers happy." },
  { n: 4, title: "Reseller credits & hierarchy", desc: "Sub-resellers, commissions, and white-label groups." },
  { n: 5, title: "Geo-blocking & security", desc: "2FA, leak audit logs, token TTL, per-line blocklists." },
  { n: 6, title: "Built-in migration", desc: "Preview import from XUI.one, 1-stream, and Xtream UI." },
  { n: 7, title: "Stream health monitoring", desc: "Telegram alerts, failover URLs, cron link probes." },
  { n: 8, title: "GBP & USD checkout", desc: "Worldwide operators sell through WHMCS, Stripe, or PayPal." },
  { n: 9, title: "Subscriber portal", desc: "Renewals, M3U download, EPG, and tickets for end users." },
  { n: 10, title: "One-click VPS install", desc: "Node + PostgreSQL + PM2 on Ubuntu or Debian in one command." },
] as const;

export default function TenFeaturesIptvPanelPage() {
  return (
    <BlogArticleShell
      post={post}
      related={[
        { label: "Full features page", href: "/features" },
        { label: "Buyer's guide", href: "/blog/best-iptv-reseller-panel-2026" },
        { label: "Panel comparison hub", href: "/best-iptv-reseller-panel" },
      ]}
      sections={[
        {
          title: "10 features every good IPTV panel must have",
          body: (
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div
                  key={f.n}
                  className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-4"
                >
                  <p className="font-display text-lg font-bold text-violet-300">{f.n}</p>
                  <h3 className="mt-1 font-semibold text-white">{f.title}</h3>
                  <p className="mt-1 text-xs text-slate-300">{f.desc}</p>
                </div>
              ))}
            </div>
          ),
        },
        {
          title: "How Nexlify maps to this checklist",
          body: (
            <p>
              Nexlify IPTV reseller panel includes all ten as production features — not roadmap promises.
              Compare row-by-row on{" "}
              <Link href="/features" className="text-violet-400 underline hover:text-violet-300">
                features
              </Link>{" "}
              or see{" "}
              <Link href="/blog/xui-one-vs-nexlify-full-comparison" className="text-violet-400 underline hover:text-violet-300">
                XUI.one vs Nexlify
              </Link>{" "}
              for legacy panel gaps.
            </p>
          ),
        },
        {
          title: "Share this checklist",
          body: (
            <p>
              Pin or share this page on Pinterest, Instagram, or operator groups — link back to{" "}
              <Link href="/pricing" className="text-violet-400 underline hover:text-violet-300">
                pricing
              </Link>{" "}
              and the{" "}
              <Link href="/demo" className="text-violet-400 underline hover:text-violet-300">
                live demo
              </Link>{" "}
              when recommending Nexlify as your IPTV management software stack.
            </p>
          ),
        },
      ]}
    />
  );
}
