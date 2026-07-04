"use client";

function barColor(pct: number): string {
  if (pct <= 0) return "rgba(255,255,255,0.12)";
  if (pct < 35) return "#22c55e";
  if (pct < 70) return "#eab308";
  if (pct < 90) return "#f97316";
  return "#ef4444";
}

function barGradient(pct: number): string {
  if (pct <= 0) return "rgba(255,255,255,0.12)";
  if (pct < 35) return "linear-gradient(90deg, #22c55e, #4ade80)";
  if (pct < 70) return "linear-gradient(90deg, #eab308, #facc15)";
  if (pct < 90) return "linear-gradient(90deg, #f97316, #fb923c)";
  return "linear-gradient(90deg, #ef4444, #f87171)";
}

export function DashboardMetricBar({
  label,
  percent,
  icon,
}: {
  label: string;
  percent: number;
  icon?: React.ReactNode;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  const color = barColor(pct);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-[4.5rem] shrink-0 flex items-center gap-1" style={{ color: "var(--muted)" }}>
        {icon}
        {label}
      </span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden relative"
        style={{ background: "rgba(0,0,0,0.35)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 relative"
          style={{
            width: `${pct}%`,
            background: barGradient(pct),
            boxShadow: pct > 0 ? `0 0 6px ${color}40` : "none",
          }}
        />
      </div>
      <span
        className="w-9 text-right tabular-nums font-semibold"
        style={{ color: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f97316" : "inherit" }}
      >
        {pct}%
      </span>
    </div>
  );
}
