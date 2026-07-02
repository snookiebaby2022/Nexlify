import Link from "next/link";
import { DEMO_PANEL_URL, getDemoConfig } from "@/lib/demo";

export function DemoBanner() {
  const demo = getDemoConfig();

  return (
    <section className="border-y border-white/10 bg-gradient-to-r from-violet-950/50 via-[#0a0814] to-amber-950/20">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-12 md:flex-row md:py-14">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400/90">
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
          className="shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3.5 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110 transition-all"
        >
          Try live demo →
        </a>
      </div>
    </section>
  );
}
