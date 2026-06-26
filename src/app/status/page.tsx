import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/status");



const SERVICES = [
  { name: "Marketing site (nexlify.live)", status: "Operational", href: site.url },
  { name: "License API", status: "Operational", href: `${site.url}/api/health` },
  { name: "Panel demo", status: "Operational", href: "https://panel.demo.nexlify.live" },
  { name: "WHMCS billing", status: "Operational", href: process.env.NEXT_PUBLIC_WHMCS_URL ?? "/pricing" },
] as const;

export default function StatusPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Status", path: "/status" },
        ]}
      />
      <WebPageJsonLd path="/status" name="System status" description="Nexlify marketing site, licensing API, and panel infrastructure status." about="Status" />

      <div className="mx-auto max-w-2xl px-4 py-16 md:py-24">
        <h1 className="font-display text-3xl font-bold text-white">System status</h1>
        <p className="mt-4 text-sm text-[var(--muted)]">
          High-level status for Nexlify services used by worldwide operators.
        </p>
        <ul className="mt-10 space-y-4">
          {SERVICES.map((s) => (
            <li key={s.name} className="glass flex items-center justify-between rounded-xl px-4 py-3">
              <a href={s.href} className="text-sm text-violet-300 hover:text-violet-200">
                {s.name}
              </a>
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {s.status}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-[var(--muted)]">
          Incident?{" "}
          <Link href="/support" className="text-violet-400 underline">
            Open a support ticket
          </Link>
        </p>
      </div>
    </div>
  );
}
