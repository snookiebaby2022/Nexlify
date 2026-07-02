import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import { PageCta } from "@/components/PageCta";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { pageSeo } from "@/lib/seo-pages";
import { pageUrl } from "@/lib/seo";

const PATH = "/blog/migrate-from-xui-or-1-stream";
const MIGRATE_DEMO_URL = `${DEMO_PANEL_URL.replace(/\/$/, "")}/admin/import/migrate`;

export const metadata = pageSeo(PATH);

const STEPS = [
  {
    title: "Start a trial or buy a license",
    summary:
      "Register for a 7-day free trial or purchase a plan, then activate your license key on the new VPS after running the one-click installer.",
    body: (
      <>
        Register for a{" "}
        <Link href="/register?trial=1" className="text-violet-400 underline hover:text-violet-300">
          7-day free trial
        </Link>{" "}
        or purchase a plan on{" "}
        <Link href="/pricing" className="text-violet-400 underline hover:text-violet-300">
          pricing
        </Link>
        . Activate the license key on your new VPS after running the{" "}
        <Link href="/install" className="text-violet-400 underline hover:text-violet-300">
          one-click installer
        </Link>
        .
      </>
    ),
  },
  {
    title: "Deploy Nexlify on a fresh VPS",
    summary:
      "Use a new Ubuntu or Debian server when possible. The installer sets up Node, PostgreSQL, PM2, and nginx. Keep your old panel online until cutover is verified.",
    body: (
      <>
        Use a new Ubuntu or Debian server when possible — parallel run reduces downtime. The installer
        sets up Node, PostgreSQL, PM2, and nginx. Keep your old XUI or 1-stream panel online until
        cutover is verified.
      </>
    ),
  },
  {
    title: "Open Import → Panel migration",
    summary:
      "In the Nexlify admin panel go to Import → Panel migration. Supported sources include XUI.one, 1-stream, Xtream UI, and Midnight Streamers.",
    body: (
      <>
        In the Nexlify admin panel go to{" "}
        <strong className="text-slate-200">Import → Panel migration</strong>. Supported sources
        include <strong className="text-slate-200">XUI.one</strong>,{" "}
        <strong className="text-slate-200">1-stream</strong>, Xtream UI, and Midnight Streamers.
        Try the wizard in the{" "}
        <a
          href={MIGRATE_DEMO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 underline hover:text-violet-300"
        >
          live demo
        </a>{" "}
        first if you want to explore the UI without touching production.
      </>
    ),
  },
  {
    title: "Run Preview — always",
    summary:
      "Click Preview before importing. Review line counts, bouquets, categories, and resellers that will be created before running a live import.",
    body: (
      <>
        Click <strong className="text-slate-200">Preview</strong> before importing. Review line counts,
        bouquets, categories, and resellers that will be created. Fix mapping errors on the old panel
        or in export files before running a live import.
      </>
    ),
  },
  {
    title: "Import lines, bouquets, and resellers",
    summary:
      "Run the import during a low-traffic window. Nexlify maps your existing structure into PostgreSQL. For Nexlify-to-Nexlify moves, use Panel transfer instead.",
    body: (
      <>
        Run the import during a low-traffic window. Nexlify maps your existing structure into its
        PostgreSQL database. For Nexlify-to-Nexlify moves, use{" "}
        <strong className="text-slate-200">Panel transfer</strong> (JSON export/import) instead.
      </>
    ),
  },
  {
    title: "Connect WHMCS billing",
    summary:
      "Follow the WHMCS IPTV module guide so new orders, renewals, suspensions, and revocations sync license state automatically.",
    body: (
      <>
        Follow the{" "}
        <Link href="/docs/whmcs" className="text-violet-400 underline hover:text-violet-300">
          WHMCS IPTV module guide
        </Link>{" "}
        so new orders, renewals, suspensions, and revocations sync license state automatically. This
        replaces manual CSV workflows common on legacy panels.
      </>
    ),
  },
  {
    title: "Point DNS and test playback",
    summary:
      "Update your panel URL or DNS when imports look correct. Test lines on real devices and keep the old panel read-only for 24–48 hours as rollback reference.",
    body: (
      <>
        Update your panel URL / DNS when imports look correct. Test a handful of lines on real
        devices — live channels, VOD, EPG, and reseller logins. Keep the old panel read-only for 24–48
        hours as a rollback reference.
      </>
    ),
  },
  {
    title: "Decommission the old panel",
    summary:
      "After stable playback and billing sync, shut down the XUI or 1-stream stack and document your new backup schedule in Nexlify admin settings.",
    body: (
      <>
        After stable playback and billing sync, shut down the XUI or 1-stream stack. Document your
        new backup schedule under Nexlify admin settings.
      </>
    ),
  },
] as const;

const MIGRATION_HOWTO_STEPS = STEPS.map((step, index) => ({
  name: step.title,
  text: step.summary,
  position: index + 1,
}));

function MigrationHowToJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Migrate from XUI.one or 1-stream to Nexlify",
    description:
      "Step-by-step checklist to migrate IPTV panel data from XUI.one or 1-stream to Nexlify with preview import and WHMCS billing.",
    url: pageUrl(PATH),
    inLanguage: ["en-GB", "en-US"],
    step: MIGRATION_HOWTO_STEPS.map((s) => ({
      "@type": "HowToStep",
      position: s.position,
      name: s.name,
      text: s.text,
      url: `${pageUrl(PATH)}#step-${s.position}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function MigrateBlogPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: "Migration checklist", path: PATH },
        ]}
      />
      <WebPageJsonLd
        path={PATH}
        name="Migrate from XUI.one or 1-stream to Nexlify"
        description="Step-by-step checklist to migrate IPTV panel data from XUI.one or 1-stream to Nexlify with preview import and WHMCS billing."
        about="Migration guide"
      />
      <MigrationHowToJsonLd />

      <article className="mx-auto max-w-3xl min-w-0 px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          Migration guide · 2026
        </p>
        <h1 className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl md:text-4xl">
          How to migrate from XUI.one or 1-stream to Nexlify
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
          A practical cutover checklist for IPTV resellers moving off legacy panels. Nexlify is
          management software only — you run the panel on your infrastructure and connect your own
          streams and billing.
        </p>

        <PageCta
          primary={{ label: "Start 7-day trial", href: "/register?trial=1" }}
          secondary={[
            { label: "Try migration UI", href: MIGRATE_DEMO_URL, external: true },
            { label: "Compare vs XUI.one", href: "/vs/xui-one" },
            { label: "Compare vs 1-stream", href: "/vs/1-stream" },
          ]}
        />

        <ol className="mt-12 space-y-8 sm:space-y-10">
          {STEPS.map((step, index) => (
            <li key={step.title} id={`step-${index + 1}`} className="flex gap-4">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-amber-500 font-display text-sm font-bold text-white"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-semibold text-white">{step.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-14 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <h2 className="font-display text-lg font-semibold text-amber-100">Why operators switch</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li>• WHMCS auto-provisioning instead of manual license spreadsheets</li>
            <li>• Telegram stream alerts and Anti-Freeze playback tooling</li>
            <li>• Sub-reseller credits, commission reports, and white-label groups</li>
            <li>• One-click install on modern Node/PostgreSQL stack</li>
          </ul>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Read{" "}
            <Link href="/vs/xui-one" className="text-violet-400 underline hover:text-violet-300">
              Nexlify vs XUI.one
            </Link>{" "}
            and{" "}
            <Link href="/vs/1-stream" className="text-violet-400 underline hover:text-violet-300">
              Nexlify vs 1-stream
            </Link>{" "}
            for feature-by-feature comparisons.
          </p>
        </section>

        <ContentDisclaimer className="mt-10" />

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          <Link href="/help" className="text-violet-400 underline hover:text-violet-300">
            Help &amp; FAQ
          </Link>
          {" · "}
          <Link href="/blog" className="text-violet-400 underline hover:text-violet-300">
            More guides
          </Link>
        </p>
      </article>
    </div>
  );
}
