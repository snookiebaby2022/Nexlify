import Link from "next/link";
import { ContentDisclaimer } from "@/components/ContentDisclaimer";
import { SOFTWARE_POSITIONING } from "@/lib/marketing-constants";
import { site } from "@/lib/site";

export function HomeSeoContent() {
  return (
    <section className="border-y border-white/10 bg-[#080612]">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <ContentDisclaimer variant="block" className="mb-10 max-w-3xl" />

        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-400/90">
            IPTV reseller &amp; management software
          </p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white md:text-4xl">
            All-in-one IPTV panel and management tool for service providers
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--muted)] md:text-lg">
            Nexlify is {SOFTWARE_POSITIONING.toLowerCase()} — a secure, reliable management tool
            for service providers worldwide. Whether you run a growing IPTV reseller business or
            operate infrastructure for hundreds of lines, our IPTV panel combines Xtream-compatible
            controls, WHMCS IPTV module automation, and operator-grade tooling in one platform you
            deploy on your own servers — without the fragility of generic cheap IPTV scripts.
          </p>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-xl font-semibold text-white">
              Why operators choose Nexlify over a generic Xtream panel
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              A typical Xtream panel focuses on playback URLs and line counts. Nexlify goes further
              as full IPTV management software: encrypted license validation, reseller white-label,
              geo-blocking, stream health monitoring, automated renewals, and a subscriber portal
              your customers actually use. You keep your stack — we handle commerce, keys, and the
              back-office workflows that scale a best reseller panel operation.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Anti-Freeze playback, sub-second zapping, backup source failover, and cron-driven EPG
              maintenance mean fewer tickets and happier subscribers. For service providers moving
              off legacy panels, the one-click installer deploys Node, PostgreSQL, PM2, and nginx on
              Ubuntu or Debian in minutes.
            </p>
          </div>

          <div>
            <h3 className="font-display text-xl font-semibold text-white">
              Built for IPTV management software at scale
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Resellers get enforced 2FA, commission reports, coupon checkout, and Telegram alerts
              when streams go offline. Operators get reseller management software that separates live
              channels from VOD, probes dead links automatically, and syncs license state every time
              WHMCS creates, suspends, or terminates a service. It is IPTV management software
              designed for real revenue — not a demo theme.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Compare our feature matrix on the{" "}
              <Link href="/features" className="text-violet-400 hover:text-violet-300 underline">
                features page
              </Link>
              , read{" "}
              <Link href="/updates" className="text-violet-400 hover:text-violet-300 underline">
                release notes
              </Link>
              , or open the live demo before you commit to a license.
            </p>
          </div>
        </div>

        <div className="mt-16 max-w-3xl">
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl">
            Global pricing, currency, and instant license delivery
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--muted)] md:text-lg">
            Nexlify sells digital IPTV panel licenses — there is no physical shipping. Customers
            worldwide can checkout in GBP or USD via Stripe or WHMCS.
            License keys and installer access are delivered instantly to your account and email
            after payment — no customs, no warehouse delays, no regional stock limits.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-xl font-semibold text-white">
              GBP and USD checkout via WHMCS
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Connect the WHMCS IPTV module so new orders provision panel licenses automatically.
              Starter and pro tiers suit solo resellers and growing service providers alike. Launch
              coupons and trial registrations are available for worldwide operators evaluating
              cheap IPTV panel options without sacrificing security or support quality.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              View current plans on our{" "}
              <Link href="/pricing" className="text-violet-400 hover:text-violet-300 underline">
                pricing page
              </Link>{" "}
              or start a{" "}
              <Link
                href="/register?trial=1"
                className="text-violet-400 hover:text-violet-300 underline"
              >
                7-day free trial
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="font-display text-xl font-semibold text-white">
              Digital delivery — deploy anywhere in minutes
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              After purchase, run the one-click installer on a VPS in London, Manchester, New York,
              Dallas, or any EU/US region your provider offers. SSL, PM2 process management, and
              PostgreSQL backups are included in the guided setup. Support tickets are answered in
              English with documentation for operators worldwide running high-concurrency streams on
              their own infrastructure.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Need help choosing hardware? See{" "}
              <Link
                href="/requirements"
                className="text-violet-400 hover:text-violet-300 underline"
              >
                system requirements
              </Link>{" "}
              and the{" "}
              <Link href="/install" className="text-violet-400 hover:text-violet-300 underline">
                install guide
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-16 max-w-3xl">
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl">
            WHMCS IPTV module and reseller tooling included
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--muted)] md:text-base">
            Every Nexlify license includes API access for automated provisioning, webhook handlers
            for renewals and suspensions, and PayPal checkout alongside card payments. The
            management tool surfaces usage reports, leak audit logs, and multi-language panel
            support so your resellers can brand the experience for local markets.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-xl font-semibold text-white">
              Automated license provisioning
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              When a customer orders through WHMCS, Nexlify issues a bound license key, activates
              the correct plan tier, and reflects status changes on suspension or termination. No
              manual CSV imports or midnight cron fixes — the IPTV panel stays aligned with your
              billing system in real time.
            </p>
          </div>

          <div>
            <h3 className="font-display text-xl font-semibold text-white">
              Affordable IPTV panel licenses that scale
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Operators searching for cheap IPTV infrastructure still need reliability. Nexlify
              balances competitive license pricing with production-grade panel software, documented
              APIs, and responsive support — the combination service providers need to grow from
              dozens to thousands of active lines on {site.domain}.
            </p>
          </div>
        </div>

        <p className="mt-16 max-w-3xl text-base leading-relaxed text-[var(--muted)]">
          Ready to replace a legacy Xtream panel with modern IPTV reseller and management software
          built for worldwide service providers? Explore{" "}
          <Link href="/pricing" className="text-violet-400 hover:text-violet-300 underline">
            IPTV panel pricing
          </Link>
          ,{" "}
          <Link href="/register?trial=1" className="text-violet-400 hover:text-violet-300 underline">
            create a trial account
          </Link>
          , or contact{" "}
          <a
            href={`mailto:${site.salesEmail}`}
            className="text-violet-400 hover:text-violet-300 underline"
          >
            {site.salesEmail}
          </a>{" "}
          for reseller volume questions. Nexlify is the management tool and best reseller panel
          choice when you need WHMCS IPTV module automation without compromise.
        </p>
      </div>
    </section>
  );
}
