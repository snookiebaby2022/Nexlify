import Link from "next/link";
import { BlogArticleShell } from "@/components/BlogArticleShell";
import { getBlogPost } from "@/lib/blog-registry";
import { blogPostMetadata } from "@/lib/blog-metadata";

const SLUG = "whmcs-iptv-automation-setup";
const post = getBlogPost(SLUG)!;

export const metadata = blogPostMetadata(post);

export default function WhmcsIptvAutomationSetupPage() {
  return (
    <BlogArticleShell
      post={post}
      related={[
        { label: "WHMCS module docs", href: "/docs/whmcs" },
        { label: "WHMCS product page", href: "/whmcs" },
        { label: "Compare WHMCS modules", href: "/compare/whmcs-iptv-module" },
      ]}
      howToSteps={[
        { name: "Install the Nexlify WHMCS module", text: "Upload the module files and activate in WHMCS admin." },
        { name: "Map product IDs", text: "Link Starter, Main, and Top Tier plans to WHMCS products 1–3." },
        { name: "Configure API credentials", text: "Enter your Nexlify licensing API key in module settings." },
        { name: "Test a sandbox order", text: "Place a test order and confirm a license key is created automatically." },
        { name: "Enable renewals and suspensions", text: "Verify invoice paid, overdue, and terminate hooks update panel state." },
      ]}
      sections={[
        {
          title: "Why WHMCS IPTV automation matters",
          body: (
            <p>
              Manual license spreadsheets break the moment you add sub-resellers or multi-currency checkout.
              <strong className="text-slate-200"> WHMCS IPTV automation</strong> ties every paid order to an IPTV
              reseller panel license — create on purchase, renew on invoice paid, suspend on overdue, revoke on
              terminate. Nexlify includes the module with every plan.
            </p>
          ),
        },
        {
          title: "What gets automated",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>License key creation when an order is marked paid</li>
              <li>Renewal extension when recurring invoices clear</li>
              <li>Suspension when billing goes overdue</li>
              <li>Revocation on cancellation or fraud chargeback workflows</li>
              <li>Addon plugin entitlements mapped to separate product IDs</li>
            </ul>
          ),
        },
        {
          title: "GBP, USD, Stripe, and PayPal",
          body: (
            <p>
              Use your existing WHMCS payment gateways. Nexlify handles license lifecycle hooks only — Stripe,
              PayPal, and bank transfer flows stay in WHMCS. Operators worldwide can sell in GBP or USD without
              custom middleware.
            </p>
          ),
        },
        {
          title: "Full technical walkthrough",
          body: (
            <p>
              Step-by-step screenshots and hook reference live in the{" "}
              <Link href="/docs/whmcs" className="text-violet-400 underline hover:text-violet-300">
                WHMCS IPTV module documentation
              </Link>
              . Start a trial, connect sandbox WHMCS, and validate keys in the Nexlify dashboard before going live.
            </p>
          ),
        },
      ]}
    />
  );
}
