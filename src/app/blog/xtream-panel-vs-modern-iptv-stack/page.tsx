import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "xtream-panel-vs-modern-iptv-stack";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

export default function XtreamPanelVsModernStackPage() {
  return (
    <BlogArticleShell
      post={post}
      related={[
        { label: "Compare Xtream panels", href: "/compare/xtream-panel" },
        { label: "Install modern stack", href: "/install" },
        { label: "Buyer's guide", href: "/blog/iptv-management-software-buyers-guide" },
      ]}
      sections={[
        {
          title: "The Xtream panel era",
          body: (
            <p>
              Generic <strong className="text-slate-200">Xtream panel</strong> forks popularized the Xtream Codes
              API shape but left operators maintaining PHP codebases, manual WHMCS scripts, and inconsistent security
              patches. Many resellers now search for{" "}
              <strong className="text-slate-200">IPTV management software</strong> on a modern stack with vendor
              support.
            </p>
          ),
        },
        {
          title: "Modern stack characteristics",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Node.js application layer with typed codebase</li>
              <li>PostgreSQL for relational reseller and line data</li>
              <li>PM2 process management and nginx reverse proxy</li>
              <li>First-class WHMCS IPTV module instead of bolt-on scripts</li>
              <li>Preview-based migration from XUI.one, 1-stream, and Xtream UI</li>
            </ul>
          ),
        },
        {
          title: "API compatibility expectations",
          body: (
            <p>
              Operators still need Xtream-compatible player URLs for STB and app ecosystems. Nexlify targets
              compatibility for common client workflows while adding reseller, billing, and monitoring layers
              missing from raw Xtream UI zips. Validate your device matrix in trial before migrating all lines.
            </p>
          ),
        },
        {
          title: "Migration path",
          body: (
            <p>
              Deploy with the{" "}
              <Link href="/install" className="text-violet-400 underline hover:text-violet-300">
                one-click installer
              </Link>
              , import via{" "}
              <Link href="/blog/migrate-from-xui-or-1-stream" className="text-violet-400 underline hover:text-violet-300">
                panel migration
              </Link>
              , and compare feature depth on{" "}
              <Link href="/compare/xtream-panel" className="text-violet-400 underline hover:text-violet-300">
                Nexlify vs Xtream panel
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
