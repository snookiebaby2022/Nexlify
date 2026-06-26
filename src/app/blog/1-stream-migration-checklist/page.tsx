import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "1-stream-migration-checklist";
const post = getBlogPost(SLUG)!;
const MIGRATE_DEMO = `${DEMO_PANEL_URL.replace(/\/$/, "")}/admin/import/migrate`;

export const metadata = blogPostMetadata(post);

export default function OneStreamMigrationChecklistPage() {
  return (
    <BlogArticleShell
      post={post}
      howToSteps={[
        { name: "Inventory 1-stream export paths", text: "Document DB dumps, API exports, or panel backup formats your fork supports." },
        { name: "Deploy Nexlify on new VPS", text: "Install via one-click script; activate license." },
        { name: "Select 1-stream source", text: "Open Import → Panel migration and choose 1-stream." },
        { name: "Preview mapping", text: "Validate resellers, bouquets, and line counts." },
        { name: "Import and test", text: "Run import off-peak; test playback on sample MAC and M3U lines." },
        { name: "Sync WHMCS", text: "Reconnect WHMCS IPTV automation to new license keys." },
      ]}
      related={[
        { label: "vs 1-stream", href: "/vs/1-stream" },
        { label: "Combined XUI + 1-stream guide", href: "/blog/migrate-from-xui-or-1-stream" },
        { label: "WHMCS setup", href: "/blog/whmcs-iptv-automation-setup" },
      ]}
      sections={[
        {
          title: "1-stream fork variability",
          body: (
            <p>
              1-stream deployments differ by fork, host, and custom modules. Nexlify migration targets common
              export structures — always run <strong className="text-slate-200">Preview</strong> because reseller
              IDs and bouquet names may not map 1:1 across stacks.
            </p>
          ),
        },
        {
          title: "Reseller and credit mapping",
          body: (
            <p>
              Sub-reseller trees and credit balances are high-risk fields. After preview, spot-check three
              reseller accounts manually: parent credit totals, child line limits, and expired-line handling.
              Fix on the source panel before re-export if counts diverge.
            </p>
          ),
        },
        {
          title: "Billing cutover",
          body: (
            <p>
              Pause auto-renew scripts on the old stack until WHMCS points at Nexlify license IDs. Follow{" "}
              <Link href="/blog/whmcs-iptv-automation-setup" className="text-violet-400 underline hover:text-violet-300">
                WHMCS IPTV automation setup
              </Link>{" "}
              and place a sandbox renewal to confirm invoice-paid hooks extend the correct key.
            </p>
          ),
        },
        {
          title: "Practice in demo first",
          body: (
            <p>
              Explore the migration wizard at{" "}
              <a href={MIGRATE_DEMO} target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">
                panel.demo.nexlify.live import
              </a>{" "}
              before touching production. Compare features on{" "}
              <Link href="/vs/1-stream" className="text-violet-400 underline hover:text-violet-300">
                Nexlify vs 1-stream
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
