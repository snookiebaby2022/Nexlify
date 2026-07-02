import Link from "next/link";
import { DEMO_PANEL_URL } from "@/lib/demo";

const MIGRATE_DEMO_URL = `${DEMO_PANEL_URL.replace(/\/$/, "")}/admin/import/migrate`;

export function MigrationCtaSection() {
  return (
    <section className="border-y border-white/10 bg-gradient-to-b from-violet-950/30 to-[#080612] py-14 md:py-16">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
          Panel migration
        </p>
        <h2 className="font-display mt-2 text-2xl font-bold text-white md:text-3xl">
          Import from XUI.one — preview before you switch
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
          Nexlify includes a built-in migration wizard for XUI, Xtream UI, and Midnight Streamers. Run a
          preview on your trial panel, then cut over on your own schedule — no manual database surgery.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
          <Link
            href="/register?trial=1"
            data-track="trial_start"
            data-track-label="migration_cta_trial"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-3 text-sm font-semibold text-slate-950 shadow-lg hover:brightness-110 transition-all sm:w-auto"
          >
            Start free trial
          </Link>
          <a
            href={MIGRATE_DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-track="demo_click"
            data-track-label="migration_cta_demo_wizard"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/20 px-8 py-3 text-sm font-semibold text-white hover:border-violet-400/40 transition-colors sm:w-auto"
          >
            Try migration UI in demo
          </a>
          <Link
            href="/blog/migrate-from-xui-or-1-stream"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 px-8 py-3 text-sm font-semibold text-violet-200 hover:border-violet-400/50 transition-colors sm:w-auto"
          >
            Migration checklist
          </Link>
        </div>
        <p className="mt-6 text-xs text-[var(--muted)]">
          <Link href="/vs/xui-one" className="text-violet-400 hover:text-violet-300 underline">
            Nexlify vs XUI.one
          </Link>
          {" · "}
          <Link href="/best-iptv-reseller-panel" className="text-violet-400 hover:text-violet-300 underline">
            Full panel comparison
          </Link>
        </p>
      </div>
    </section>
  );
}
