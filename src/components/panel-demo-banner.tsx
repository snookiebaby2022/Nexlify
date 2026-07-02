export function PanelDemoBanner() {
  return (
    <div
      className="panel-demo-banner mb-4 rounded-lg border px-4 py-2.5 text-sm font-medium"
      role="status"
      style={{
        borderColor: "rgba(251, 191, 36, 0.35)",
        background: "rgba(251, 191, 36, 0.12)",
        color: "var(--text)",
      }}
    >
      <span className="font-semibold" style={{ color: "#fbbf24" }}>
        Demo mode
      </span>
      <span style={{ color: "var(--muted)" }}>
        {" "}
        — explore the panel read-only. Creating or changing content and live playback are disabled.
      </span>
    </div>
  );
}
