type CompareCell = boolean | "partial" | string;

type Row = {
  feature: string;
  nexlify: CompareCell;
  xtream: CompareCell;
  xui: CompareCell;
  onestream: CompareCell;
  ministra: CompareCell;
};

const ROWS: Row[] = [
  { feature: "WHMCS native", nexlify: true, xtream: false, xui: "partial", onestream: false, ministra: "partial" },
  { feature: "Anti-freeze playback", nexlify: true, xtream: "partial", xui: false, onestream: false, ministra: false },
  { feature: "Sub-second zapping", nexlify: true, xtream: false, xui: "partial", onestream: false, ministra: false },
  { feature: "GBP + USD checkout", nexlify: true, xtream: false, xui: false, onestream: false, ministra: "partial" },
  { feature: "Built-in support tickets", nexlify: true, xtream: false, xui: "partial", onestream: false, ministra: "partial" },
  { feature: "Preview panel migration", nexlify: true, xtream: false, xui: false, onestream: false, ministra: false },
  { feature: "One-click install", nexlify: true, xtream: false, xui: false, onestream: false, ministra: false },
];

function cellLabel(value: CompareCell): string {
  if (value === true) return "✓";
  if (value === false) return "—";
  if (value === "partial") return "~";
  return value;
}

function cellClass(value: CompareCell): string {
  if (value === true) return "text-emerald-300/90";
  if (value === "partial") return "text-amber-300/80";
  return "text-[var(--muted)]";
}

export function PricingComparisonTable() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16">
      <h2 className="font-display text-center text-2xl font-bold text-white">
        How Nexlify compares
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[var(--muted)]">
        Feature snapshot vs typical Xtream UI, XUI.one, 1-stream, and Ministra stacks — third-party names used
        descriptively.
      </p>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="mt-10 rounded-2xl border border-white/10">
          <table className="w-full min-w-[min(100%,520px)] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-3 font-semibold text-white sm:px-4">Feature</th>
                <th className="px-3 py-3 font-semibold text-violet-300 sm:px-4">Nexlify</th>
                <th className="px-3 py-3 font-semibold text-[var(--muted)] sm:px-4">Xtream UI</th>
                <th className="px-3 py-3 font-semibold text-[var(--muted)] sm:px-4">XUI.one</th>
                <th className="px-3 py-3 font-semibold text-[var(--muted)] sm:px-4">1-stream</th>
                <th className="px-3 py-3 font-semibold text-[var(--muted)] sm:px-4">Ministra</th>
              </tr>
            </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.feature} className="border-b border-white/5">
                <td className="px-3 py-3 text-slate-200 sm:px-4">{row.feature}</td>
                <td className={`px-3 py-3 font-medium sm:px-4 ${cellClass(row.nexlify)}`}>
                  {cellLabel(row.nexlify)}
                </td>
                <td className={`px-3 py-3 sm:px-4 ${cellClass(row.xtream)}`}>{cellLabel(row.xtream)}</td>
                <td className={`px-3 py-3 sm:px-4 ${cellClass(row.xui)}`}>{cellLabel(row.xui)}</td>
                <td className={`px-3 py-3 sm:px-4 ${cellClass(row.onestream)}`}>{cellLabel(row.onestream)}</td>
                <td className={`px-3 py-3 sm:px-4 ${cellClass(row.ministra)}`}>
                  {cellLabel(row.ministra)}
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
    </section>
  );
}
