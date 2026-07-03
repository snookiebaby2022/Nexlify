import Link from "next/link";
import { DEMO_PANEL_URL, getDemoConfig } from "@/lib/demo";

export function DemoBanner() {
  const demo = getDemoConfig();

  return (
    <section className="relative overflow-hidden border-y border-violet-500/10 bg-gradient-to-r from-violet-950/30 via-[#080714] to-orange-950/15">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_100%_50%,rgba(249,115,22,0.06),transparent)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-12 md:flex-row md:py-14">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
            Try before you buy
          </p>
          <h2 className="font-display mt-2 text-2xl font-bold text-white md:text-3xl">
            Explore the IPTV panel demo
          </h2>
          <p className="mt-2 max-w-lg text-sm text-[var(--muted)]">
            {demo.panelUrl
              ? "Live sandbox with demo login and license activation — same stack as production."
              : "Preview the back-office UI and configure your live panel URL when ready."}
          </p>
        </div>
        <a
          href={demo.panelUrl ?? DEMO_PANEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-8 py-3.5 font-semibold text-white shadow-lg shadow-orange-500/20 hover:brightness-110 transition-all"
        >
          Try live demo →
        </a>
      </div>
    </section>
  );
}
