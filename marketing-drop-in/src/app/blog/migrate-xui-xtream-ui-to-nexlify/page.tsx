import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { BlogMigrationVisual } from "@/components/BlogMigrationVisual";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "migrate-xui-xtream-ui-to-nexlify";
const post = getBlogPost(SLUG)!;
const MIGRATE_DEMO = `${DEMO_PANEL_URL.replace(/\/$/, "")}/admin/import/migrate`;

export const metadata = blogPostMetadata(post);

export default function MigrateXuiXtreamUiPage() {
  return (
    <BlogArticleShell
      post={post}
      howToSteps={[
        { name: "Deploy Nexlify on a new VPS", text: "Run the one-click installer; keep the old panel online." },
        { name: "Open Import → Panel migration", text: "Select XUI.one or Xtream UI as the source." },
        { name: "Run Preview (dry-run)", text: "Validate lines, bouquets, resellers before live import." },
        { name: "Execute import off-peak", text: "Import during low traffic and monitor playback." },
        { name: "Connect WHMCS IPTV module", text: "Sync license keys, renewals, and suspensions." },
        { name: "Cut over DNS and decommission", text: "Switch panel URL after tests pass; retire old stack." },
      ]}
      related={[
        { label: "Combined checklist", href: "/blog/migrate-from-xui-or-1-stream" },
        { label: "XUI.one comparison", href: "/blog/xui-one-vs-nexlify-full-comparison" },
        { label: "Features", href: "/features" },
      ]}
      sections={[
        {
          title: "Built-in migration tool — not a manual CSV job",
          body: (
            <>
              <p>
                Nexlify ships a native panel migration wizard under{" "}
                <strong className="text-slate-200">Import → Panel migration</strong>. Supported sources include{" "}
                <strong className="text-slate-200">XUI.one</strong>,{" "}
                <strong className="text-slate-200">Xtream UI</strong>, 1-stream, and Midnight Streamers. Always
                run <strong className="text-slate-200">Preview</strong> first — it is the safest way to migrate
                without surprise data loss.
              </p>
              <BlogMigrationVisual />
            </>
          ),
        },
        {
          title: "Try migration in the demo panel first",
          body: (
            <p>
              Open{" "}
              <a href={MIGRATE_DEMO} target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">
                panel.demo.nexlify.live → Import → Panel migration
              </a>{" "}
              to walk through the UI before touching production. Screenshots above match the demo panel layout
              operators see during preview import.
            </p>
          ),
        },
        {
          title: "Xtream UI vs XUI.one notes",
          body: (
            <p>
              Xtream UI forks vary by host and custom modules — mapping may differ for categories and reseller
              IDs. XUI.one exports are more consistent but still require preview validation. See{" "}
              <Link href="/blog/xtream-panel-vs-modern-iptv-stack" className="text-violet-400 underline hover:text-violet-300">
                Xtream vs modern stack
              </Link>{" "}
              for architecture context.
            </p>
          ),
        },
        {
          title: "After migration",
          body: (
            <p>
              Enable Anti-Freeze on test bouquets, configure Telegram alerts, and follow{" "}
              <Link href="/blog/whmcs-iptv-automation-setup" className="text-violet-400 underline hover:text-violet-300">
                WHMCS + IPTV automation
              </Link>
              . Start your{" "}
              <Link href="/register?trial=1" className="text-violet-400 underline hover:text-violet-300">
                7-day trial
              </Link>{" "}
              to run a parallel migration test.
            </p>
          ),
        },
      ]}
    />
  );
}
