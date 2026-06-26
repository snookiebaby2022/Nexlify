const ADVANTAGES = [
  {
    title: "Native PostgreSQL",
    desc: "Same engine as 1-stream — no MySQL→PG conversion. Direct live migration with schema auto-discovery.",
  },
  {
    title: "Fast subscriber playback",
    desc: "Optimized /live path, URL caching, and configurable probe timeouts for quicker zapping.",
  },
  {
    title: "Stream agent v2",
    desc: "Push nginx snippets and per-stream start/stop to edge servers with heartbeat + command queue.",
  },
  {
    title: "Line IP lock & rate limits",
    desc: "Lock lines to IPs, cap connections, and throttle playback abuse per line.",
  },
  {
    title: "Built-in support tickets & live chat",
    desc: "Webhook-driven renewals and credits without manual line edits.",
  },
  {
    title: "Modern admin UX",
    desc: "XUI-familiar modules with stream probe, process monitor, import queue, and mass tools.",
  },
];

export function PanelAdvantages() {
  return (
    <div
      className="rounded-lg p-4 grid gap-3 sm:grid-cols-2"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <p className="sm:col-span-2 text-sm font-medium">Why operators choose Nexlify</p>
      {ADVANTAGES.map((a) => (
        <div key={a.title} className="text-sm">
          <p className="font-medium">{a.title}</p>
          <p className="opacity-70 mt-0.5">{a.desc}</p>
        </div>
      ))}
    </div>
  );
}
