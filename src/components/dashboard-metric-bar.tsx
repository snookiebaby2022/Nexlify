"use client";

function barColor(pct: number): string {
  if (pct <= 0) return "rgba(255,255,255,0.12)";
  if (pct < 35) return "#22c55e";
  if (pct < 70) return "#eab308";
  return "#f97316";
}

export function DashboardMetricBar({
  label,
  percent,
}: {
  label: string;
  percent: number;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-[4.5rem] shrink-0" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(0,0,0,0.35)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor(pct) }}
        />
      </div>
      <span className="w-9 text-right tabular-nums font-medium">{pct}%</span>
    </div>
  );
}
