import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "iptv-management-software-buyers-guide";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

export default function IptvManagementSoftwareBuyersGuidePage() {
  return (
    <BlogArticleShell
      post={post}
      related={[
        { label: "Best reseller panel 2026", href: "/blog/best-iptv-reseller-panel-2026" },
        { label: "Requirements", href: "/requirements" },
        { label: "WHMCS automation", href: "/blog/whmcs-iptv-automation-setup" },
      ]}
      sections={[
        {
          title: "IPTV management software vs a bare Xtream API",
          body: (
            <p>
              A playlist URL is not a business. <strong className="text-slate-200">IPTV management software</strong>{" "}
              covers reseller hierarchy, license enforcement, billing hooks, stream health, security, and migration
              from legacy panels. Your <strong className="text-slate-200">IPTV reseller panel</strong> should ship
              with a maintained admin UI and installer — not a zip of PHP files from a forum.
            </p>
          ),
        },
        {
          title: "Must-have capabilities",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Native WHMCS IPTV module (create / renew / suspend / revoke)</li>
              <li>Sub-reseller credits and commission reporting</li>
              <li>Encrypted license keys with server binding</li>
              <li>Panel migration with preview import</li>
              <li>Stream probes, failover URLs, and alerting (e.g. Telegram)</li>
              <li>One-click VPS install on Ubuntu or Debian</li>
            </ul>
          ),
        },
        {
          title: "Infrastructure expectations",
          body: (
            <p>
              Plan a primary VPS for the panel (Node, PostgreSQL, Redis, nginx, PM2) and optional edge stream
              servers as you scale. Review{" "}
              <Link href="/requirements" className="text-violet-400 underline hover:text-violet-300">
                system requirements
              </Link>{" "}
              and the{" "}
              <Link href="/install" className="text-violet-400 underline hover:text-violet-300">
                installer guide
              </Link>{" "}
              before purchase — Nexlify is self-hosted software, not a hosted playlist service.
            </p>
          ),
        },
        {
          title: "Try before you migrate",
          body: (
            <p>
              Use the{" "}
              <Link href="/register?trial=1" className="text-violet-400 underline hover:text-violet-300">
                7-day trial
              </Link>{" "}
              to validate WHMCS hooks and import a subset of lines from XUI.one or 1-stream. Compare against our{" "}
              <Link href="/blog/best-iptv-reseller-panel-2026" className="text-violet-400 underline hover:text-violet-300">
                best IPTV reseller panel
              </Link>{" "}
              checklist before full cutover.
            </p>
          ),
        },
      ]}
    />
  );
}
