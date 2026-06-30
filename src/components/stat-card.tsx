export function StatCard({
  label,
  value,
  sub,
  accent = "sky",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "sky" | "violet" | "emerald" | "amber" | "rose" | "cyan";
}) {
  const themes: Record<string, { bg: string; border: string; value: string }> = {
    sky: {
      bg: "linear-gradient(135deg, rgba(94,184,232,0.18) 0%, rgba(37,99,235,0.08) 100%)",
      border: "rgba(94,184,232,0.45)",
      value: "#5eb8e8",
    },
    violet: {
      bg: "linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(167,139,250,0.08) 100%)",
      border: "rgba(124,58,237,0.4)",
      value: "#a78bfa",
    },
    emerald: {
      bg: "linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(52,211,153,0.08) 100%)",
      border: "rgba(16,185,129,0.4)",
      value: "#34d399",
    },
    amber: {
      bg: "linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(251,191,36,0.1) 100%)",
      border: "rgba(245,158,11,0.45)",
      value: "#fbbf24",
    },
    rose: {
      bg: "linear-gradient(135deg, rgba(244,63,94,0.18) 0%, rgba(251,113,133,0.08) 100%)",
      border: "rgba(244,63,94,0.4)",
      value: "#fb7185",
    },
    cyan: {
      bg: "linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(34,211,238,0.08) 100%)",
      border: "rgba(6,182,212,0.4)",
      value: "#22d3ee",
    },
  };
  const t = themes[accent] ?? themes.sky;

  return (
    <div
      className="rounded-xl border p-4 shadow-sm"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <div className="text-sm font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: t.value }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
