import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { DemoLaunchCard } from "@/components/demo/DemoLaunchCard";
import { PanelPreview } from "@/components/demo/PanelPreview";
import { PageCta } from "@/components/PageCta";
import { getDemoConfig, DEMO_PANEL_URL } from "@/lib/demo";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/demo");



const steps = [
  {
    n: "1",
    title: "Open the demo panel",
    desc: "Use the launch button to open your IPTV panel installation in a new tab.",
  },
  {
    n: "2",
    title: "Sign in",
    desc: "No license required on the demo host — go straight to login with admin / admin123 or reseller / reseller123.",
  },
  {
    n: "3",
    title: "Explore",
    desc: "Browse streams, video management, lines, servers, and settings. Live playback and saving changes are disabled in sandbox mode.",
  },
];

export default function DemoPage() {
  const demo = getDemoConfig();

  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Demo", path: "/demo" },
        ]}
      />
      <WebPageJsonLd path="/demo" name="Live IPTV panel demo for resellers worldwide" description="Open the full IPTV reseller panel at panel.demo.nexlify.live. Operators worldwide can explore dashboards, lines, and WHMCS-ready licensing." about="Demo" />
      <SoftwareProductJsonLd path="/demo" />

      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          Worldwide · Live preview
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold text-white md:text-5xl">
          Live IPTV panel demo for resellers worldwide
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
          Open the full IPTV reseller panel at panel.demo.nexlify.live. Operators worldwide can
          explore the same sandbox — browse dashboards, lines, and WHMCS-ready licensing; live
          playback and saving changes are blocked in demo mode.
        </p>

        <PageCta
          primary={{ label: "Open live demo panel", href: DEMO_PANEL_URL, external: true }}
          secondary={[
            { label: "View pricing", href: "/pricing" },
            { label: "Start 7-day trial", href: "/register?trial=1" },
          ]}
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="space-y-6">
            <PanelPreview />
            <p className="text-center text-xs text-[var(--muted)]">
              Illustrative UI — your live panel matches your installed theme and modules.
            </p>
          </div>
          <DemoLaunchCard demo={demo} />
        </div>

        <section className="mt-20">
          <h2 className="font-display text-2xl font-bold text-white">How to use the demo</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="glass rounded-2xl p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 font-display text-lg font-bold text-violet-300">
                  {s.n}
                </span>
                <h3 className="font-display mt-4 font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="glass mt-16 rounded-2xl p-8 md:p-10">
          <h2 className="font-display text-xl font-semibold text-white">
            Connect demo to your real panel
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            Deploy on any region worldwide VPS with the{" "}
            <Link href="/install" className="text-violet-400 hover:text-violet-300 underline">
              one-click installer
            </Link>
            . Run the panel on <code className="text-violet-300">127.0.0.1:8080</code> and nginx at{" "}
            <code className="text-violet-300">/panel/</code>. License validation:{" "}
            <code className="text-violet-300">{site.url}/api/licenses/validate</code>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/register?trial=1"
              className="inline-flex rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
            >
              Start 7-day trial
            </Link>
            <Link
              href="/help"
              className="inline-flex rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-slate-200 hover:border-violet-400/40 hover:text-white"
            >
              Help &amp; FAQ
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
