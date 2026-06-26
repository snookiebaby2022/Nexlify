import Link from "next/link";
import { DEMO_PANEL_URL } from "@/lib/demo";

export function BlogResourceLinks() {
  return (
    <section
      className="mt-12 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-6"
      aria-label="Explore Nexlify"
    >
      <h2 className="font-display text-lg font-semibold text-white">Try Nexlify IPTV management software</h2>
      <ul className="mt-4 space-y-2 text-sm text-slate-300">
        <li>
          →{" "}
          <Link href="/features" className="text-violet-400 underline hover:text-violet-300">
            IPTV reseller panel features
          </Link>{" "}
          — Anti-Freeze, security, WHMCS, migration
        </li>
        <li>
          →{" "}
          <Link href="/pricing" className="text-violet-400 underline hover:text-violet-300">
            Pricing vs XUI.one &amp; 1-stream
          </Link>{" "}
          — from £50/mo, WHMCS IPTV module included
        </li>
        <li>
          →{" "}
          <a
            href={DEMO_PANEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 underline hover:text-violet-300"
          >
            Live demo panel
          </a>{" "}
          — explore dashboard, migration, and billing flows
        </li>
      </ul>
    </section>
  );
}
