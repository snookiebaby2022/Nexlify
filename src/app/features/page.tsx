import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { TrialCtaButton } from "@/components/TrialCtaButton";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { PANEL_PORTAL_URL } from "@/lib/demo";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/features");



type FeatureRow = {

  category: string;

  feature: string;

  nexlify: "included" | "new" | "roadmap";

  typical: "included" | "partial" | "missing";

};



const ROWS: FeatureRow[] = [

  { category: "User & Subscription", feature: "SMS expiry/renewal alerts (Twilio)", nexlify: "included", typical: "missing" },

  { category: "User & Subscription", feature: "Multi-device add-on packages", nexlify: "included", typical: "partial" },

  { category: "User & Subscription", feature: "Automated email + in-panel notifications", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "Deep transcoding / stream processing", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "Advanced load balancing", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "Built-in web player", nexlify: "included", typical: "missing" },

  { category: "Content & Streaming", feature: "MAG devices (full native support)", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "Enigma2 bouquet tools", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "All-in-one streaming engine", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "Granular stream input management", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "Legacy Xtream features", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "Multi-server + backup source URLs", nexlify: "included", typical: "missing" },

  { category: "Content & Streaming", feature: "Catch-up / DVR archive presets (24-72h)", nexlify: "included", typical: "partial" },

  { category: "Content & Streaming", feature: "SchedulesDirect & WebGrab+Plus EPG", nexlify: "included", typical: "missing" },

  { category: "Content & Streaming", feature: "ABR auto-switch + variant ladder hints", nexlify: "included", typical: "missing" },

  { category: "Content & Streaming", feature: "Auto-fix dead links (cron probe)", nexlify: "included", typical: "missing" },

  { category: "Content & Streaming", feature: "Backup source URL failover", nexlify: "included", typical: "missing" },

  { category: "Security", feature: "Enforce 2FA for resellers", nexlify: "included", typical: "partial" },

  { category: "Security", feature: "Stream leak audit log", nexlify: "included", typical: "missing" },

  { category: "Security", feature: "Playback URL token TTL", nexlify: "included", typical: "missing" },

  { category: "Security", feature: "Geo-blocking per line + blocklists", nexlify: "included", typical: "partial" },

  { category: "Monitoring", feature: "Telegram alerts (offline, load, abuse)", nexlify: "included", typical: "missing" },

  { category: "Monitoring", feature: "Stream health dashboard + error fix", nexlify: "included", typical: "partial" },

  { category: "Monitoring", feature: "Usage & commission reports (CSV export)", nexlify: "included", typical: "missing" },

  { category: "Billing", feature: "Coupon codes + checkout API", nexlify: "included", typical: "missing" },

  { category: "Billing", feature: "PayPal checkout (Orders v2)", nexlify: "included", typical: "partial" },

  { category: "Billing", feature: "WHMCS webhook integration", nexlify: "included", typical: "partial" },

  { category: "Billing", feature: "Website 50% launch coupon banner", nexlify: "new", typical: "missing" },

  { category: "UI/UX", feature: "Reseller white-label (logo, accent, support)", nexlify: "included", typical: "missing" },

  { category: "UI/UX", feature: "Multi-language panel (en, es, fr, ar)", nexlify: "included", typical: "missing" },

  { category: "UI/UX", feature: "Subscriber portal (/portal)", nexlify: "included", typical: "missing" },

  { category: "UI/UX", feature: "Portal renew, M3U download, EPG, tickets", nexlify: "new", typical: "missing" },

  { category: "Automation", feature: "Full backup ZIP/gzip + restore", nexlify: "included", typical: "partial" },

  { category: "Automation", feature: "Scheduled EPG/channel cron UI", nexlify: "included", typical: "missing" },

  { category: "Automation", feature: "PostgreSQL pg_dump cron script", nexlify: "new", typical: "missing" },

  { category: "Automation", feature: "S3 remote backup placeholders", nexlify: "roadmap", typical: "missing" },

  { category: "Automation", feature: "Stream auto-recovery failover", nexlify: "included", typical: "missing" },

];



function Mark({ kind }: { kind: "included" | "new" | "roadmap" | "partial" | "missing" }) {

  if (kind === "included") return <span title="Included">✅ Included</span>;

  if (kind === "new") return <span title="New in 1.5.3">🆕 New in 1.5.3</span>;

  if (kind === "roadmap") return <span title="Roadmap">🔜 Roadmap</span>;

  if (kind === "partial") return <span>⚠ Partial</span>;

  return <span>— Missing</span>;

}



export default function FeaturesPage() {

  const categories = [...new Set(ROWS.map((r) => r.category))];



  return (

    <div className="min-h-screen text-slate-100" style={{ background: "#0a1628" }}>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Features", path: "/features" },
        ]}
      />
      <WebPageJsonLd path="/features" name="IPTV panel features for resellers worldwide" description="Compare Nexlify IPTV management software features for worldwide service providers — WHMCS, streaming, security, billing, and reseller tools." about="Features" />
      <SoftwareProductJsonLd path="/features" includeProduct />


      <header

        className="border-b sticky top-0 z-50 backdrop-blur-md"

        style={{ borderColor: "#1e3a5f", background: "rgba(10,22,40,0.92)" }}

      >

        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">

          <Link href="/" className="text-xl font-bold tracking-tight">

            <span style={{ color: "#22d3ee" }}>Nexlify</span>

          </Link>

          <nav className="flex flex-wrap gap-4 text-sm">

            <Link href="/" className="hover:text-cyan-300 transition-colors">

              Home

            </Link>

            <Link href="/features" className="text-cyan-400 font-medium">

              Features

            </Link>

            <Link href="/updates" className="hover:text-cyan-300 transition-colors">

              Updates

            </Link>

            <a href={PANEL_PORTAL_URL} className="hover:text-cyan-300 transition-colors">

              Portal

            </a>

            <a

              href="https://panel.nexlify.live/login"

              className="rounded-full px-4 py-1.5 font-medium"

              style={{ background: "#22d3ee", color: "#0a1628" }}

            >

              Open panel

            </a>

          </nav>

        </div>

      </header>



      <main className="max-w-6xl mx-auto px-4 py-12 space-y-10">

        <div className="space-y-3">

          <p className="text-sm uppercase tracking-widest text-cyan-400/80">Worldwide · Compare</p>

          <h1 className="text-3xl font-bold text-white sm:text-4xl">IPTV management software — Nexlify vs typical panels</h1>

          <p className="text-lg max-w-2xl" style={{ color: "#94a3b8" }}>

            Honest feature matrix for worldwide service providers evaluating IPTV management software
            and IPTV reseller panel tools. Compare security, WHMCS IPTV automation, Anti-Freeze
            streaming, and migration against typical Xtream and XUI.one forks.

          </p>

          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <TrialCtaButton size="sm" trackLabel="features_hero" />
            <Link href="/pricing" className="text-sm text-cyan-400 underline hover:text-cyan-300">
              View pricing
            </Link>
            <a
              href="https://panel.demo.nexlify.live"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-cyan-400 underline hover:text-cyan-300"
            >
              Live demo
            </a>
          </div>

        </div>



        <section className="space-y-4 max-w-3xl">

          <h2 className="text-2xl font-bold text-white">What matters in IPTV management software</h2>

          <ul className="grid gap-3 sm:grid-cols-2 text-sm" style={{ color: "#94a3b8" }}>
            <li className="rounded-lg border p-4" style={{ borderColor: "#1e3a5f" }}>
              <strong className="text-cyan-300">Security</strong> — 2FA, geo-blocking, leak audit logs,
              playback token TTL
            </li>
            <li className="rounded-lg border p-4" style={{ borderColor: "#1e3a5f" }}>
              <strong className="text-cyan-300">Billing</strong> — WHMCS IPTV module, PayPal, coupons,
              auto renewals
            </li>
            <li className="rounded-lg border p-4" style={{ borderColor: "#1e3a5f" }}>
              <strong className="text-cyan-300">Anti-Freeze</strong> — smoother playback, failover URLs,
              stream health alerts
            </li>
            <li className="rounded-lg border p-4" style={{ borderColor: "#1e3a5f" }}>
              <strong className="text-cyan-300">Migration</strong> — preview import from XUI.one and Xtream UI
            </li>
          </ul>

        </section>



        <section className="space-y-4 max-w-3xl">

          <h2 className="text-2xl font-bold text-white">Why operators switch to Nexlify</h2>

          <p className="text-base leading-relaxed" style={{ color: "#94a3b8" }}>

            Generic Xtream panel installs lack WHMCS IPTV module depth, leak auditing, and reseller
            white-label controls. Nexlify is IPTV management software built as a management tool for
            service providers who need billing automation, stream health monitoring, and subscriber
            self-service in one IPTV panel.

          </p>

          <h3 className="text-lg font-semibold text-cyan-300">Billing, security, and streaming in one stack</h3>

          <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>

            From coupon checkout and PayPal orders to geo-blocking and Telegram alerts, every row
            below reflects production features on nexlify.live — not a roadmap slide deck. worldwide
            resellers use the same codebase with GBP or USD licensing.

          </p>

        </section>



        {categories.map((cat) => (

          <section key={cat} className="space-y-3">

            <h2 className="text-lg font-semibold text-cyan-300">{cat}</h2>

            <div

              className="rounded-xl border overflow-hidden"

              style={{ borderColor: "#1e3a5f", background: "#111b2e" }}

            >

              <div className="overflow-x-auto">

              <table className="w-full min-w-[min(100%,480px)] text-sm">

                <thead>

                  <tr style={{ background: "#0f172a", color: "#64748b" }}>

                    <th className="text-left p-3 font-medium">Feature</th>

                    <th className="text-left p-3 font-medium">Nexlify</th>

                    <th className="text-left p-3 font-medium">Typical panel</th>

                  </tr>

                </thead>

                <tbody>

                  {ROWS.filter((r) => r.category === cat).map((r) => (

                    <tr key={r.feature} className="border-t" style={{ borderColor: "#1e3a5f" }}>

                      <td className="p-3">{r.feature}</td>

                      <td className="p-3">

                        <Mark kind={r.nexlify} />

                      </td>

                      <td className="p-3">

                        <Mark kind={r.typical} />

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

              </div>

            </div>

          </section>

        ))}



        <p className="text-sm" style={{ color: "#64748b" }}>

          Ready to try it?{" "}

          <a href="https://panel.nexlify.live/login" className="text-cyan-400 underline">

            Open the live demo panel

          </a>

          , visit the{" "}

          <a href={PANEL_PORTAL_URL} className="text-cyan-400 underline">

            subscriber portal

          </a>

          , or read the{" "}

          <Link href="/updates" className="text-cyan-400 underline">

            1.5.3 release notes

          </Link>

          .

        </p>

      </main>

    </div>

  );

}

