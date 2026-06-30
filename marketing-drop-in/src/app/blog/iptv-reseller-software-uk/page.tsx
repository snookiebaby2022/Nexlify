import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "iptv-reseller-software-uk";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

export default function IptvResellerSoftwareUkPage() {
  return (
    <BlogArticleShell
      post={post}
      ctaSecondary={[{ label: "UK reseller landing page", href: "/lp/reseller-panel-uk" }]}
      related={[
        { label: "GBP pricing", href: "/pricing" },
        { label: "WHMCS UK setup", href: "/blog/whmcs-iptv-automation-setup" },
        { label: "Privacy policy", href: "/privacy" },
      ]}
      sections={[
        {
          title: "IPTV reseller software UK — what British operators need",
          body: (
            <p>
              UK resellers typically require GBP checkout, clear software-only positioning, and WHMCS workflows
              their accountant recognizes. Nexlify is{" "}
              <strong className="text-slate-200">IPTV reseller software UK</strong> operators can self-host —
              an <strong className="text-slate-200">IPTV reseller panel</strong> with{" "}
              <strong className="text-slate-200">WHMCS IPTV module</strong> support, not a content library.
            </p>
          ),
        },
        {
          title: "GBP billing and WHMCS",
          body: (
            <p>
              Sell licenses in GBP through WHMCS with Stripe or PayPal. The Nexlify module auto-provisions keys
              when invoices are paid — no manual CSV handoffs. USD remains available for international
              sub-resellers on the same install.
            </p>
          ),
        },
        {
          title: "Compliance and positioning",
          body: (
            <p>
              Nexlify provides management software only. You supply streams, customer terms, and support.
              Review our{" "}
              <Link href="/terms" className="text-violet-400 underline hover:text-violet-300">
                terms
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-violet-400 underline hover:text-violet-300">
                privacy policy
              </Link>
              , and on-site disclaimers before marketing to end users. Consult qualified counsel for UK-specific
              obligations in your business model.
            </p>
          ),
        },
        {
          title: "Getting started in the UK",
          body: (
            <p>
              Start on the{" "}
              <Link href="/lp/reseller-panel-uk" className="text-violet-400 underline hover:text-violet-300">
                UK reseller landing page
              </Link>
              , open a{" "}
              <Link href="/register?trial=1" className="text-violet-400 underline hover:text-violet-300">
                free trial
              </Link>
              , and deploy with the{" "}
              <Link href="/install" className="text-violet-400 underline hover:text-violet-300">
                one-click installer
              </Link>{" "}
              on a EU/UK VPS region for lower latency to British subscribers.
            </p>
          ),
        },
      ]}
    />
  );
}
