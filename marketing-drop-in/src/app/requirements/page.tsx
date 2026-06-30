import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { SystemRequirementsSection } from "@/components/SystemRequirementsSection";
import {
  HARDWARE_ROLES,
  OS_REQUIREMENTS,
  REQUIREMENTS_SUMMARY,
} from "@/lib/system-requirements";
import { site } from "@/lib/site";

import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/requirements");

const COMPARE_ROWS = [
  {
    feature: "Install method",
    panel: "install-linux.sh (full stack)",
    stream: "nexlify-server-install.sh (agent only)",
  },
  {
    feature: "Database",
    panel: "PostgreSQL on host",
    stream: "None — talks to panel",
  },
  {
    feature: "Typical ports",
    panel: "80 HTTP (IP) or 443 HTTPS (domain) · 8080 stream edge",
    stream: "8080 HTTP · 443 HTTPS",
  },
  {
    feature: "OS",
    panel: "Ubuntu 20.04+ / Debian 11+",
    stream: "Any Linux with agent script",
  },
  {
    feature: "Use case",
    panel: "One central brain per deployment",
    stream: "Scale live channels & viewers",
  },
];

export default function RequirementsPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Requirements", path: "/requirements" },
        ]}
      />
      <WebPageJsonLd path="/requirements" name="System requirements" description="Plan your panel VPS and optional stream edge servers. Minimum and recommended OS and hardware for Nexlify IPTV panel deployments." about="Requirements" />

    <div className="mesh-bg min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          {site.domain}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
          System requirements
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
          Plan your panel VPS and optional stream edge servers. The panel runs on one Linux host;
          additional VPS or dedicated boxes handle live streaming load.
        </p>

        <div className="mt-12">
          <SystemRequirementsSection showCompareLink={false} />
        </div>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold text-white">
            Panel vs stream edge
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Compare what each server type runs in a typical Nexlify deployment.
          </p>
          <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="px-4 py-3 font-semibold text-white"> </th>
                  <th className="px-4 py-3 font-semibold text-violet-300">Panel VPS</th>
                  <th className="px-4 py-3 font-semibold text-amber-300/90">Stream edge</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-200">{row.feature}</td>
                    <td className="px-4 py-3 text-slate-300">{row.panel}</td>
                    <td className="px-4 py-3 text-slate-300">{row.stream}</td>
                  </tr>
                ))}
                <tr className="border-t border-white/10 bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-slate-200">RAM (recommended)</td>
                  <td className="px-4 py-3 text-slate-300">
                    {HARDWARE_ROLES[0].recommended.ram}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {HARDWARE_ROLES[1].recommended.ram}
                  </td>
                </tr>
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-slate-200">CPU (recommended)</td>
                  <td className="px-4 py-3 text-slate-300">
                    {HARDWARE_ROLES[0].recommended.cpu}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {HARDWARE_ROLES[1].recommended.cpu}
                  </td>
                </tr>
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-slate-200">Disk (recommended)</td>
                  <td className="px-4 py-3 text-slate-300">
                    {HARDWARE_ROLES[0].recommended.disk}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {HARDWARE_ROLES[1].recommended.disk}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14 glass rounded-2xl border border-white/10 p-6 md:p-8">
          <h2 className="font-display text-lg font-semibold text-white">Supported platforms</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {OS_REQUIREMENTS.map((row) => (
              <li key={row.os}>
                <span className="text-white">{row.os}</span>
                <span className="text-[var(--muted)]"> — {row.status}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-slate-300">{REQUIREMENTS_SUMMARY}</p>
        </section>

        <p className="mt-12 text-center text-sm text-[var(--muted)]">
          Ready to deploy?{" "}
          <Link href="/install" className="text-violet-400 hover:text-violet-300 underline">
            Open the panel installer
          </Link>{" "}
          or{" "}
          <Link href="/pricing" className="text-violet-400 hover:text-violet-300 underline">
            get a license
          </Link>
          .
        </p>
      </div>
    </div>
    </>
  );
}
