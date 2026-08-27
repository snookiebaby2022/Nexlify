import Link from "next/link";

export default function PlayerAdminPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Player</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Built-in web player for subscribers, plus a multi-view grid for operators (1-Stream parity).
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/webplayer" className="rounded-lg px-4 py-2 text-sm font-medium btn-positive">
          Open web player
        </Link>
        <Link
          href="/webplayer/multiview"
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          Multi-view grid
        </Link>
        <Link href="/admin/settings/player" className="text-sm self-center" style={{ color: "var(--accent)" }}>
          Player & CDM settings
        </Link>
      </div>
    </div>
  );
}
