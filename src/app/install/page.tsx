import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { HowToJsonLd } from "@/components/HowToJsonLd";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { PageCta } from "@/components/PageCta";
import { PanelInstallInstructions } from "@/components/PanelInstallInstructions";
import { PanelInstaller } from "@/components/PanelInstaller";
import { SystemRequirementsSection } from "@/components/SystemRequirementsSection";
import { DEMO_PANEL_URL } from "@/lib/demo";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/install");

export default function InstallPage() {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Install", path: "/install" },
        ]}
      />
      <WebPageJsonLd
        path="/install"
        name="Xtream panel installer for your VPS"
        description="One-command installer for Nexlify Xtream-compatible IPTV panel on Ubuntu or Debian VPS worldwide."
        about="Install"
      />
      <SoftwareProductJsonLd path="/install" />
      <HowToJsonLd />
      <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          {site.domain} · worldwide VPS
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          Install your IPTV panel in one command
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
          Deploy the full Nexlify IPTV panel on a fresh Ubuntu or Debian VPS. One line to install, sign in
          with the admin password printed at the end, then paste your license key in the panel — no license
          flag required on the command line. IP installs use plain{" "}
          <code className="text-violet-300">http://YOUR_IP/login</code> on port 80 (no{" "}
          <code className="text-violet-300">:3000</code>).
        </p>

        <PageCta
          primary={{ label: "Run one-click installer", href: "#installer" }}
          secondary={[
            { label: "Try live demo", href: DEMO_PANEL_URL, external: true },
            { label: "View pricing", href: "/pricing" },
          ]}
        />

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-2xl font-bold text-white">How it works</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm leading-relaxed text-[var(--muted)] md:text-base">
            <li>
              SSH into your VPS and run the installer with <strong className="text-slate-300">--domain</strong>{" "}
              set to your server IP or hostname
            </li>
            <li>
              Open the login URL from the terminal output (saved to{" "}
              <code className="text-violet-300">/root/nexlify/install-credentials</code>)
            </li>
            <li>
              Sign in as <code className="text-violet-300">admin</code> with the generated password
            </li>
            <li>
              Go to <strong className="text-slate-300">Admin → License</strong> and paste your{" "}
              <code className="text-violet-300">NXLF1...</code> key from{" "}
              <Link href="/dashboard" className="text-violet-400 hover:text-violet-300 underline">
                My licenses
              </Link>
            </li>
          </ol>
          <p className="text-sm leading-relaxed text-[var(--muted)] md:text-base">
            The installer provisions Node.js, PostgreSQL, Redis, and PM2. Domain installs also configure nginx
            and optional Let&apos;s Encrypt HTTPS. See{" "}
            <Link href="/requirements" className="text-violet-400 hover:text-violet-300 underline">
              system requirements
            </Link>{" "}
            for CPU and RAM guidance.
          </p>
        </section>

        <div id="installer" className="mt-12 scroll-mt-24 space-y-10">
          <SystemRequirementsSection compact />
          <PanelInstallInstructions />
          <PanelInstaller />
        </div>

        <p className="mt-12 text-center text-sm text-[var(--muted)]">
          Stuck during setup?{" "}
          <Link href="/support" className="text-violet-400 hover:text-violet-300 underline">
            Open a support ticket
          </Link>{" "}
          or read the{" "}
          <Link href="/help" className="text-violet-400 hover:text-violet-300 underline">
            Help &amp; FAQ
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
