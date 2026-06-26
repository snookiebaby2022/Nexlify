import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "migrate-xui-one-to-nexlify";
const post = getBlogPost(SLUG)!;
const MIGRATE_DEMO = `${DEMO_PANEL_URL.replace(/\/$/, "")}/admin/import/migrate`;

export const metadata = blogPostMetadata(post);

export default function MigrateXuiOnePage() {
  return (
    <BlogArticleShell
      post={post}
      ctaSecondary={[
        { label: "Full migration checklist", href: "/blog/migrate-from-xui-or-1-stream" },
        { label: "Try migration UI", href: MIGRATE_DEMO, external: true },
        { label: "vs XUI.one", href: "/vs/xui-one" },
      ]}
      howToSteps={[
        { name: "Deploy Nexlify in parallel", text: "Keep XUI.one online on the old VPS while Nexlify runs on a fresh server." },
        { name: "Export or connect XUI source", text: "Use Import → Panel migration and select XUI.one as the source." },
        { name: "Run Preview", text: "Validate line counts, bouquets, and reseller mapping before live import." },
        { name: "Import during low traffic", text: "Execute the import and monitor PostgreSQL load." },
        { name: "Reconnect WHMCS", text: "Point the WHMCS IPTV module at the new license server." },
        { name: "Cut over DNS", text: "Switch panel URL when playback tests pass on sample lines." },
      ]}
      related={[
        { label: "XUI.one comparison", href: "/vs/xui-one" },
        { label: "Pricing vs XUI.one", href: "/blog/xui-one-vs-nexlify-pricing" },
        { label: "Install guide", href: "/install" },
      ]}
      sections={[
        {
          title: "Why operators migrate off XUI.one",
          body: (
            <p>
              XUI.one forks are widespread but often lack maintained WHMCS integration, modern security defaults,
              and predictable upgrade paths. Nexlify targets operators who want to{" "}
              <strong className="text-slate-200">migrate from XUI.one to Nexlify</strong> without rebuilding
              reseller hierarchies from CSV exports.
            </p>
          ),
        },
        {
          title: "Parallel run strategy",
          body: (
            <p>
              Never delete XUI.one until Nexlify playback is verified. Run both panels for 24–48 hours: import
              data, test lines on real devices, confirm EPG and VOD, then switch DNS or customer portal URLs.
              Rollback stays available on the old stack if mapping issues appear.
            </p>
          ),
        },
        {
          title: "Preview import is non-negotiable",
          body: (
            <p>
              In Nexlify admin open <strong className="text-slate-200">Import → Panel migration</strong>, choose
              XUI.one, and click <strong className="text-slate-200">Preview</strong>. Fix bouquet or category
              mismatches before committing. Try the flow in the{" "}
              <a href={MIGRATE_DEMO} target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">
                demo migration UI
              </a>{" "}
              first if you are new to the wizard.
            </p>
          ),
        },
        {
          title: "After cutover",
          body: (
            <p>
              Connect{" "}
              <Link href="/docs/whmcs" className="text-violet-400 underline hover:text-violet-300">
                WHMCS IPTV automation
              </Link>
              , enable Telegram alerts for stream health, and document backups in admin settings. For the full
              8-step checklist including 1-stream notes, see{" "}
              <Link href="/blog/migrate-from-xui-or-1-stream" className="text-violet-400 underline hover:text-violet-300">
                migrate from XUI.one or 1-stream
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
