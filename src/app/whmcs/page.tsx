import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { PageCta } from "@/components/PageCta";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/whmcs");

const BENEFITS = [
  {
    title: "Auto-provision on order",
    body: "Paid WHMCS orders create Nexlify license keys instantly — no manual CSV exports or support tickets.",
  },
  {
    title: "Renewals & suspensions synced",
    body: "Invoice paid, overdue, suspend, and terminate events update panel license state in real time.",
  },
  {
    title: "GBP & USD carts",
    body: "Customers worldwide checkout in GBP or USD via Stripe or PayPal through WHMCS.",
  },
  {
    title: "Product ID mapping",
    body: "Starter, Main, and Top Tier panel plans map to WHMCS product IDs 1–3. Addon plugins use separate IDs.",
  },
  {
    title: "Stripe + PayPal",
    body: "Use your existing WHMCS payment gateways — Nexlify only handles license lifecycle hooks.",
  },
  {
    title: "Documented setup",
    body: "Step-by-step install guide with API endpoints, webhook URLs, and troubleshooting for Worldwide hosts.",
  },
] as const;

const STEPS = [
  "Install the Nexlify WHMCS module from your license dashboard or docs.",
  "Create WHMCS products for Starter, Main, and Top Tier — map product IDs in the module config.",
  "Point the module API URL to your Nexlify licensing endpoint and paste your API key.",
  "Place a test order — confirm the license key appears in the client area and activates on your panel.",
] as const;

export default function WhmcsPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "WHMCS IPTV module", path: "/whmcs" },
        ]}
      />
      <WebPageJsonLd
        path="/whmcs"
        name="WHMCS IPTV Module — Auto-Provision Panel Licenses"
        description="Connect WHMCS to your IPTV panel for automatic license provisioning, renewals, and suspensions."
        about="WHMCS IPTV module"
      />
      <SoftwareProductJsonLd path="/whmcs" includeProduct />

      <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          WHMCS integration · Worldwide
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold text-white md:text-5xl">
          WHMCS IPTV module for automatic license provisioning
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
          Sell Nexlify IPTV panel licenses through WHMCS — orders, renewals, suspensions, and
          terminations stay synced without manual key management.
        </p>

        <PageCta
          primary={{ label: "Start 7-day trial", href: "/register?trial=1" }}
          secondary={[
            { label: "WHMCS setup docs", href: "/docs/whmcs" },
            { label: "Try live demo", href: DEMO_PANEL_URL, external: true },
          ]}
        />

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="glass rounded-2xl p-6">
              <h2 className="font-semibold text-violet-200">{b.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{b.body}</p>
            </div>
          ))}
        </div>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-bold text-white">Setup in four steps</h2>
          <ol className="mt-6 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-4 text-sm text-slate-300">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 font-bold text-violet-300">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-[var(--muted)]">
            Full instructions:{" "}
            <Link href="/docs/whmcs" className="text-violet-400 hover:text-violet-300 underline">
              /docs/whmcs
            </Link>
            {" · "}
            <Link href="/pricing" className="text-violet-400 hover:text-violet-300 underline">
              View panel pricing
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
