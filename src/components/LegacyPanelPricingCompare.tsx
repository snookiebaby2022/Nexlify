import Link from "next/link";

type CompareCell = boolean | "partial" | string;

type Row = {
  feature: string;
  nexlify: CompareCell;
  xui: CompareCell;
  oneStream: CompareCell;
};

const ROWS: Row[] = [
  {
    feature: "License from",
    nexlify: "£50/mo (Starter)",
    xui: "Varies / community forks",
    oneStream: "Fork-dependent",
  },
  {
    feature: "WHMCS IPTV module",
    nexlify: true,
    xui: "partial",
    oneStream: false,
  },
  {
    feature: "IPTV management software stack",
    nexlify: "Node + PostgreSQL",
    xui: "Legacy PHP",
    oneStream: "Varies by fork",
  },
  {
    feature: "Built-in XUI / 1-stream migration",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
  {
    feature: "Preview import (dry-run)",
    nexlify: true,
    xui: false,
    oneStream: "partial",
  },
  {
    feature: "7-day free trial",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
  {
    feature: "GBP + USD checkout",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
  {
    feature: "In-panel support tickets",
    nexlify: true,
    xui: "partial",
    oneStream: "partial",
  },
  {
    feature: "Anti-freeze playback",
    nexlify: true,
    xui: false,
    oneStream: false,
  },
];

function cellLabel(value: CompareCell): string {
  if (value === true) return "✓";
  if (value === false) return "—";
  if (value === "partial") return "~";
  return value;
}

function cellClass(value: CompareCell): string {
  if (value === true) return "text-emerald-300/90 font-medium";
  if (value === "partial") return "text-amber-300/80";
  return "text-[var(--muted)]";
}

export function LegacyPanelPricingCompare() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-12" aria-labelledby="legacy-panel-compare-heading">
      <h2 id="legacy-panel-compare-heading" className="font-display text-center text-2xl font-bold text-white md:text-3xl">
        Nexlify vs XUI.one vs 1-stream
      </h2>
      <p className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-[var(--muted)] md:text-base">
        Operators searching for an <strong className="text-slate-300">IPTV reseller panel</strong> often compare
        Nexlify against legacy XUI.one forks and 1-stream stacks. Every Nexlify license includes the{" "}
        <strong className="text-slate-300">WHMCS IPTV module</strong> and full{" "}
        <strong className="text-slate-300">IPTV management software</strong> — not a bolt-on script bundle.
        Third-party names are used descriptively only.
      </p>

      <div className="-mx-4 mt-10 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04]">
          <table className="w-full min-w-[min(100%,560px)] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-3.5 font-semibold text-white sm:px-4">What operators compare</th>
                <th className="px-3 py-3.5 font-semibold text-violet-300 sm:px-4">Nexlify</th>
                <th className="px-3 py-3.5 font-semibold text-[var(--muted)] sm:px-4">XUI.one</th>
                <th className="px-3 py-3.5 font-semibold text-[var(--muted)] sm:px-4">1-stream</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-3 font-medium text-slate-200 sm:px-4">{row.feature}</td>
                  <td className={`px-3 py-3 sm:px-4 ${cellClass(row.nexlify)}`}>{cellLabel(row.nexlify)}</td>
                  <td className={`px-3 py-3 sm:px-4 ${cellClass(row.xui)}`}>{cellLabel(row.xui)}</td>
                  <td className={`px-3 py-3 sm:px-4 ${cellClass(row.oneStream)}`}>
                    {cellLabel(row.oneStream)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-center text-xs text-[var(--muted)] sm:hidden">Swipe to compare columns</p>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        ✓ included · ~ partial or add-on · — not typical
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm">
        <Link href="/vs/xui-one" className="text-violet-400 hover:text-violet-300 underline">
          Full Nexlify vs XUI.one comparison
        </Link>
        <Link href="/vs/1-stream" className="text-violet-400 hover:text-violet-300 underline">
          Full Nexlify vs 1-stream comparison
        </Link>
        <Link href="/blog/migrate-from-xui-or-1-stream" className="text-violet-400 hover:text-violet-300 underline">
          Migration checklist
        </Link>
      </div>
    </section>
  );
}
