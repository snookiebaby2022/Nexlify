import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { PageCta } from "@/components/PageCta";
import { SoftwareProductJsonLd } from "@/components/SoftwareProductJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { DEMO_PANEL_URL } from "@/lib/demo";

type CompareRow = { feature: string; nexlify: string; other: string };

type ComparePageShellProps = {
  path: string;
  breadcrumbLabel: string;
  eyebrow: string;
  h1: string;
  intro: string;
  otherLabel: string;
  rows: CompareRow[];
  closing: string;
  relatedLinks?: { label: string; href: string; external?: boolean }[];
};

export function ComparePageShell({
  path,
  breadcrumbLabel,
  eyebrow,
  h1,
  intro,
  otherLabel,
  rows,
  closing,
  relatedLinks,
}: ComparePageShellProps) {
  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: breadcrumbLabel, path },
        ]}
      />
      <WebPageJsonLd path={path} name={h1} description={intro} about={breadcrumbLabel} />
      <SoftwareProductJsonLd path={path} description={intro} includeProduct />
      <div className="mx-auto max-w-4xl min-w-0 px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">{eyebrow}</p>
        <h1 className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl md:text-4xl">{h1}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">{intro}</p>

        <PageCta
          primary={{ label: "Try live demo", href: DEMO_PANEL_URL, external: true }}
          secondary={[
            { label: "View pricing", href: "/pricing" },
            { label: "Start 7-day trial", href: "/register?trial=1" },
          ]}
        />

        <div className="-mx-4 mt-12 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="rounded-2xl border border-white/10">
            <table className="w-full min-w-[min(100%,480px)] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-3 py-3 font-semibold text-white sm:px-4">Feature</th>
                  <th className="px-3 py-3 font-semibold text-violet-300 sm:px-4">Nexlify</th>
                  <th className="px-3 py-3 font-semibold text-[var(--muted)] sm:px-4">{otherLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.feature} className="border-b border-white/5">
                    <td className="px-3 py-3 text-slate-200 sm:px-4">{row.feature}</td>
                    <td className="px-3 py-3 text-emerald-300/90 sm:px-4">{row.nexlify}</td>
                    <td className="px-3 py-3 text-[var(--muted)] sm:px-4">{row.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-center text-xs text-[var(--muted)] sm:hidden">Swipe to compare columns</p>
        </div>

        <p className="mt-8 text-sm leading-relaxed text-[var(--muted)]">{closing}</p>
        {relatedLinks && relatedLinks.length > 0 && (
          <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {relatedLinks.map((link, i) => (
              <span key={link.href}>
                {i > 0 && <span className="text-[var(--muted)]"> · </span>}
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 underline hover:text-violet-300"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link href={link.href} className="text-violet-400 underline hover:text-violet-300">
                    {link.label}
                  </Link>
                )}
              </span>
            ))}
          </p>
        )}
        <p className="mt-6 text-sm">
          <Link href="/features" className="text-violet-400 underline hover:text-violet-300">
            Full feature matrix
          </Link>
          {" · "}
          <Link href="/help" className="text-violet-400 underline hover:text-violet-300">
            Help &amp; FAQ
          </Link>
        </p>
      </div>
    </div>
  );
}
