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
  // AI Studio
  { category: "AI Studio", feature: "AI Hub — central dashboard for all AI tools", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Voice Query — voice-to-SQL via Whisper transcription", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Natural Language — query database using plain English", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Anomaly Detector — AI fraud/abuse detection", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Bouquet Builder — AI-recommended bouquet configs", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "EPG Scraper — AI-powered EPG data extraction", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Health Predictor — predictive stream health analysis", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Viewer Analytics — AI-driven viewer behavior insights", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Support Chat — AI-powered customer support assistant", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Transcode Recommender — AI-suggested bitrate/resolution", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Restream Detector — AI unauthorized restream detection", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Logo Generator — AI logo creation via DALL-E 3", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Thumbnail Generator — AI thumbnail creation", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Invoice Generator — AI-generated invoices", nexlify: "new", typical: "missing" },
  { category: "AI Studio", feature: "Seasonal Recommender — seasonal content suggestions", nexlify: "new", typical: "missing" },

  // Security
  { category: "Security", feature: "DDoS Shield — Redis rate limiting + IP auto-block", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Encryption at Rest — AES-256-GCM envelope encryption", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "VPN Auto-Block — auto-block VPN/hosting IPs", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Bot Stealth — anti-bot/anti-scanner response headers", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Device Binding — fingerprint-based device binding per line", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Stream Fingerprinting — invisible watermarking + token signatures", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Same-IP Detection — multi-line same-IP with auto-actions", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Apps Lock — policy-based app allow/block-listing per line", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Playback Rate Limiting — Redis per-line per-IP rate limiting", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Playback Blocklist — IP/ASN/ISP/UA blocklist enforcement", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Hide VOD URLs / VOD Proxy", nexlify: "new", typical: "missing" },
  { category: "Security", feature: "Enforce 2FA for resellers", nexlify: "included", typical: "partial" },
  { category: "Security", feature: "Stream leak audit log", nexlify: "included", typical: "missing" },
  { category: "Security", feature: "Playback URL token TTL", nexlify: "included", typical: "missing" },
  { category: "Security", feature: "Geo-blocking per line + ASN/ISP blocklists", nexlify: "included", typical: "partial" },
  { category: "Security", feature: "Server Guard — server security hardening", nexlify: "new", typical: "missing" },

  // Streaming & Infrastructure
  { category: "Streaming & Infrastructure", feature: "WebRTC Streaming — full WebRTC gateway with MediaMTX", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Intelligent LB Pro — health + geo + bandwidth-weighted selection", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "DNS Rotator — round-robin/random DNS rotation per server", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Transcoding Studio — named FFmpeg profiles (NVENC, 1080p HQ, etc.)", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Streaming Engine — dedicated streaming engine config", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Process Monitor — real-time FFmpeg process monitoring", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Source Monitor — source down, bitrate drop, loop detection alerts", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Source Swap — automatic backup source URL failover config", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Performance Core — hardware-tier auto-optimization profiles", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Auto Issue Fix — automatic stream issue remediation", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "RTMP Management — RTMP endpoint and IP management", nexlify: "new", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Deep transcoding / stream processing", nexlify: "included", typical: "partial" },
  { category: "Streaming & Infrastructure", feature: "Multi-server + backup source URLs", nexlify: "included", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Catch-up / DVR archive presets (24-72h)", nexlify: "included", typical: "partial" },
  { category: "Streaming & Infrastructure", feature: "ABR auto-switch + variant ladder hints", nexlify: "included", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Auto-fix dead links (cron probe)", nexlify: "included", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "Stream auto-recovery failover", nexlify: "included", typical: "missing" },
  { category: "Streaming & Infrastructure", feature: "All-in-one streaming engine", nexlify: "included", typical: "partial" },
  { category: "Streaming & Infrastructure", feature: "Granular stream input management", nexlify: "included", typical: "partial" },

  // Content Management
  { category: "Content Management", feature: "TMDB Integration — auto-sync posters, ratings, genres, overviews", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "Watch Folders — auto-scan directories for media import", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "M3U Sync Jobs — scheduled M3U playlist sync from providers", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "EPG Auto-Assignment — AI-powered EPG channel matching", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "EPG Calendar — visual EPG calendar view", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "Radio Stations — dedicated radio management", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "Created Channels (24/7) — looping channel creation", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "Stream Review — review M3U streams before import", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "Import Queue — queued import processing", nexlify: "new", typical: "missing" },
  { category: "Content Management", feature: "SchedulesDirect & WebGrab+Plus EPG", nexlify: "included", typical: "missing" },
  { category: "Content Management", feature: "Built-in web player", nexlify: "included", typical: "missing" },
  { category: "Content Management", feature: "Legacy Xtream features", nexlify: "included", typical: "partial" },

  // User & Reseller Management
  { category: "User & Reseller", feature: "User Groups — hierarchical groups with config, color, banned flag", nexlify: "new", typical: "missing" },
  { category: "User & Reseller", feature: "Packages — credit cost, device slots, bouquet assignments, duration", nexlify: "new", typical: "missing" },
  { category: "User & Reseller", feature: "Access Codes — one-time use codes for line activation", nexlify: "new", typical: "missing" },
  { category: "User & Reseller", feature: "Reseller API Keys — scoped keys with granular permissions + IP restrictions", nexlify: "new", typical: "missing" },
  { category: "User & Reseller", feature: "Mass Edit — bulk ops for lines, streams, channels, movies, series, bouquets", nexlify: "new", typical: "missing" },
  { category: "User & Reseller", feature: "Migration from NXT, XCIPTV, Xtream UI, XUI, Custom", nexlify: "new", typical: "partial" },
  { category: "User & Reseller", feature: "Sub-reseller hierarchy & credits", nexlify: "included", typical: "missing" },
  { category: "User & Reseller", feature: "MAG devices (full native support)", nexlify: "included", typical: "partial" },
  { category: "User & Reseller", feature: "Enigma2 bouquet tools", nexlify: "included", typical: "partial" },
  { category: "User & Reseller", feature: "Multi-device add-on packages", nexlify: "included", typical: "partial" },
  { category: "User & Reseller", feature: "Automated email + in-panel notifications", nexlify: "included", typical: "partial" },

  // Billing
  { category: "Billing", feature: "Stripe & PayPal checkout — auto-provision, renew, suspend", nexlify: "included", typical: "partial" },
  { category: "Billing", feature: "Stripe checkout (cards, GBP/USD)", nexlify: "included", typical: "partial" },
  { category: "Billing", feature: "PayPal checkout (Orders v2)", nexlify: "included", typical: "partial" },
  { category: "Billing", feature: "Advanced billing logs — financial audit trail", nexlify: "included", typical: "missing" },
  { category: "Billing", feature: "Commission reports (CSV export)", nexlify: "included", typical: "missing" },

  // Monitoring & Analytics
  { category: "Monitoring & Analytics", feature: "Connection World Map — geographic connection visualization", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Bandwidth Over Time — bandwidth monitoring charts", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Stream Rank / Top Channels — channel popularity ranking", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Theft Detection — same-IP, VOD, stream theft with auto-disable", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Live Connections — real-time connection monitoring", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Viewer Heatmap — geographic viewer distribution", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Advanced Analytics — real-time viewer stats, revenue, retention", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Quality Monitoring — bitrate drops, packet loss, stream failure alerts", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Failover Testing — automated backup stream testing with reporting", nexlify: "new", typical: "missing" },
  { category: "Monitoring & Analytics", feature: "Stream health dashboard + error fix", nexlify: "included", typical: "partial" },
  { category: "Monitoring & Analytics", feature: "Telegram alerts (offline, load, abuse)", nexlify: "included", typical: "missing" },

  // App Builder
  { category: "App Builder", feature: "Build branded APK — custom logo, colors, package name, server URL", nexlify: "new", typical: "missing" },
  { category: "App Builder", feature: "White-label Mobile Apps — per-reseller branded Android/iOS apps", nexlify: "new", typical: "missing" },

  // Business & Monetization
  { category: "Business & Monetization", feature: "Dynamic Pricing Engine — peak/off-peak multipliers, time-based pricing", nexlify: "new", typical: "missing" },
  { category: "Business & Monetization", feature: "Multi-tenancy — per-reseller branding, isolated configs, tenant permissions", nexlify: "new", typical: "missing" },
  { category: "Business & Monetization", feature: "Loyalty Program — points, badges, tier levels for active viewers", nexlify: "new", typical: "missing" },
  { category: "Business & Monetization", feature: "Billing Integration — Stripe, PayPal with invoice management", nexlify: "new", typical: "missing" },
  { category: "Business & Monetization", feature: "Content Moderation — flag, review, approve/reject streams", nexlify: "new", typical: "missing" },

  // Operations & Maintenance
  { category: "Operations & Maintenance", feature: "Disaster Recovery API — one-click health check, restore-from-file, restore-latest", nexlify: "new", typical: "missing" },
  { category: "Operations & Maintenance", feature: "Backup Encryption — AES-256-GCM with SHA-256 checksum verification", nexlify: "new", typical: "missing" },
  { category: "Operations & Maintenance", feature: "Cloud Backup Worker — S3/xDrive/Dropbox upload with pg_dump integration", nexlify: "new", typical: "missing" },
  { category: "Operations & Maintenance", feature: "Backup & Restore — automated backups with one-click restore", nexlify: "new", typical: "missing" },
  { category: "Operations & Maintenance", feature: "Advanced EPG — multi-source EPG with sync and quality scoring", nexlify: "new", typical: "missing" },
  { category: "Operations & Maintenance", feature: "Transcoding Profiles — H.264/H.265/VP9/AV1 with GPU acceleration", nexlify: "new", typical: "missing" },
  { category: "Operations & Maintenance", feature: "Security Features — IP whitelist, brute-force protection, security alerts", nexlify: "new", typical: "missing" },

  // UI/UX
  { category: "UI/UX", feature: "Avatar Customization — animated frames and avatar studio", nexlify: "new", typical: "missing" },
  { category: "UI/UX", feature: "Panel Chat — in-panel messaging between users", nexlify: "new", typical: "missing" },
  { category: "UI/UX", feature: "Panel Notifications — admin-to-reseller announcements with priority", nexlify: "new", typical: "missing" },
  { category: "UI/UX", feature: "Expiry Videos — custom videos for expired/suspended lines", nexlify: "new", typical: "missing" },
  { category: "UI/UX", feature: "Reseller white-label (logo, accent, support)", nexlify: "included", typical: "missing" },
  { category: "UI/UX", feature: "Multi-language panel (en, es, fr, ar)", nexlify: "included", typical: "missing" },
  { category: "UI/UX", feature: "Subscriber portal — renew, M3U download, EPG, tickets", nexlify: "included", typical: "missing" },

  // Automation & Maintenance
  { category: "Automation & Maintenance", feature: "xDrive Encrypted Cloud Backup — S3/GCS/Azure with retention", nexlify: "new", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Server Cleaner — auto-cleanup of orphaned streams, expired lines, logs", nexlify: "new", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Disk Monitor — disk usage monitoring and alerts", nexlify: "new", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Panel Health Watchdog — auto-restart and health monitoring", nexlify: "new", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Panel Transfer — transfer panel data between servers", nexlify: "new", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Domain & SSL Management — in-panel SSL/domain config", nexlify: "new", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Cache/Redis Management — Redis caching layer config", nexlify: "new", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Scheduled Tasks (Cron UI) — visual cron job management", nexlify: "included", typical: "missing" },
  { category: "Automation & Maintenance", feature: "Full backup ZIP/gzip + restore", nexlify: "included", typical: "partial" },
];



function Mark({ kind }: { kind: "included" | "new" | "roadmap" | "partial" | "missing" }) {

  if (kind === "included") return <span title="Included">✅ Included</span>;

  if (kind === "new") return <span title="New in 1.9.2">🆕 New</span>;

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
      <WebPageJsonLd path="/features" name="IPTV panel features for resellers worldwide" description="Compare Nexlify IPTV management software features for worldwide service providers — streaming, security, billing, and reseller tools." about="Features" />
      <SoftwareProductJsonLd path="/features" includeProduct />

      <main className="max-w-6xl mx-auto px-4 py-12 space-y-10">

        <div className="space-y-3">

          <p className="text-sm uppercase tracking-widest text-cyan-400/80">Worldwide · Compare</p>

          <h1 className="text-3xl font-bold text-white sm:text-4xl">IPTV management software — Nexlify vs typical panels</h1>

          <p className="text-lg max-w-2xl" style={{ color: "#94a3b8" }}>

            Honest feature matrix for worldwide service providers evaluating IPTV management software
            and IPTV reseller panel tools. Compare security, IPTV billing automation, Anti-Freeze
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
              <strong className="text-cyan-300">Billing</strong> — Stripe & PayPal checkout, auto
              renewals, license delivery
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

            Generic Xtream panel installs lack Stripe & PayPal checkout depth, leak auditing, and reseller
            white-label controls. Nexlify is IPTV management software built as a management tool for
            service providers who need billing automation, stream health monitoring, and subscriber
            self-service in one IPTV panel.

          </p>

          <h3 className="text-lg font-semibold text-cyan-300">Billing, security, and streaming in one stack</h3>

          <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>

            From Stripe & PayPal checkout to geo-blocking and Telegram alerts, every row
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

            1.9.2 release notes

          </Link>

          .

        </p>

      </main>

    </div>

  );

}

