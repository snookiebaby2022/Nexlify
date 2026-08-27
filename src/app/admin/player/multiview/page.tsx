import Link from "next/link";

export default function AdminMultiviewPage() {
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold">Multi-view player</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Watch 4 or 9 live channels at once — same job as 1-Stream’s multi-stream player. Use a line username and
        password on the public player.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/webplayer/multiview"
          className="rounded px-4 py-2 text-sm text-white"
          style={{ background: "var(--accent)" }}
        >
          Open multi-view
        </Link>
        <Link href="/webplayer" className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          Single web player
        </Link>
        <Link href="/admin/settings/player" className="text-sm self-center" style={{ color: "var(--accent)" }}>
          Player settings
        </Link>
      </div>
    </div>
  );
}
