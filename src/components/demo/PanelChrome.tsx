import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  activeNav?: string;
  navItems?: string[];
  subtitle?: string;
  compact?: boolean;
};

const DEFAULT_NAV = [
  "Dashboard",
  "Subscriptions",
  "Streams",
  "Lines",
  "MAG",
  "Resellers",
  "Settings",
];

export function PanelChrome({
  children,
  activeNav = "Dashboard",
  navItems = DEFAULT_NAV,
  subtitle = "panel.demo.nexlify.live — IPTV Back Office",
  compact = false,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0a14] shadow-2xl shadow-violet-950/50">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#14111f] px-3 py-2 md:px-4 md:py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        <span className="ml-2 truncate font-mono text-[10px] text-[var(--muted)] md:ml-4 md:text-xs">
          {subtitle}
        </span>
      </div>

      <div className={`flex ${compact ? "min-h-[220px]" : "min-h-[300px] md:min-h-[380px]"}`}>
        <aside className="hidden w-28 shrink-0 border-r border-white/10 bg-[#100e18] p-2 sm:block md:w-40 md:p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-violet-400/80 md:text-[10px]">
            Menu
          </p>
          <ul className="mt-2 space-y-1 text-[10px] text-slate-400 md:mt-3 md:text-xs">
            {navItems.map((item) => (
              <li
                key={item}
                className={`rounded-lg px-2 py-1 ${
                  item === activeNav ? "bg-violet-500/20 text-violet-200" : ""
                }`}
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>
        <div className="flex-1 p-3 md:p-5">{children}</div>
      </div>
    </div>
  );
}
