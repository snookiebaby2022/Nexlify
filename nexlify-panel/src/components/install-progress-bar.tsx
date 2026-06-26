"use client";

export function InstallProgressBar({
  progress,
  step,
  error,
}: {
  progress: number;
  step: string;
  error?: string;
}) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
        <span>{step}</span>
        <span>{pct}%</span>
      </div>
      <div
        className="h-2.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: error ? "var(--danger)" : "var(--btn-positive)",
          }}
        />
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
