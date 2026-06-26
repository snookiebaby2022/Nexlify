import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "anti-freeze-iptv-panel-explained";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

export default function AntiFreezeIptvPanelPage() {
  return (
    <BlogArticleShell
      post={post}
      related={[
        { label: "All features", href: "/features" },
        { label: "Live demo", href: "/demo" },
        { label: "Buyer's guide", href: "/blog/iptv-management-software-buyers-guide" },
      ]}
      sections={[
        {
          title: "What is an Anti-Freeze IPTV panel?",
          body: (
            <p>
              Subscribers blame the panel when streams buffer during peak hours or weak CDN hops. An{" "}
              <strong className="text-slate-200">Anti-Freeze IPTV panel</strong> adds playback-side tooling in
              your <strong className="text-slate-200">IPTV management software</strong> to reduce visible freezes
              — complementing source health checks, failover URLs, and server load balancing.
            </p>
          ),
        },
        {
          title: "How Nexlify Anti-Freeze fits your stack",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Works alongside backup source URL failover and cron link probes</li>
              <li>Pairs with ABR ladder hints for unstable last-mile connections</li>
              <li>Does not replace upstream capacity planning on your stream servers</li>
              <li>Configured per operator policy — not a one-size CDN replacement</li>
            </ul>
          ),
        },
        {
          title: "When operators enable it",
          body: (
            <p>
              Enable Anti-Freeze when you serve residential lines across variable ISPs, resell internationally,
              or migrate from legacy panels that lacked playback-side controls. Test on a staging bouquet before
              enabling globally — compare KPIs in your analytics stack (Umami, GA, or in-panel connection logs).
            </p>
          ),
        },
        {
          title: "See it in the product",
          body: (
            <p>
              Anti-Freeze is included on Nexlify IPTV reseller panel licenses. Explore stream settings in the{" "}
              <a
                href="https://panel.demo.nexlify.live"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 underline hover:text-violet-300"
              >
                live demo
              </a>{" "}
              and read the full matrix on{" "}
              <Link href="/features" className="text-violet-400 underline hover:text-violet-300">
                features
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
