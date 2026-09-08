export function PanelRouteFallback() {
  return (
    <div className="panel-route-fallback space-y-4 p-1" aria-busy="true" aria-live="polite">
      <div className="h-7 w-48 rounded-md animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
      <div className="h-4 w-80 max-w-full rounded-md animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.12)" }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 border-b last:border-b-0 animate-pulse"
            style={{
              borderColor: "var(--border)",
              background: i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.025)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
