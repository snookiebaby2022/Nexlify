import Link from "next/link";

export default function PlayerAdminPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Player</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Configure the built-in player and Widevine CDM under panel settings.
      </p>
      <Link
        href="/admin/settings/player"
        className="inline-block rounded-lg px-4 py-2 text-sm font-medium btn-positive"
      >
        Open player & CDM settings
      </Link>
      <Link href="/admin/modules" className="block text-sm link-back">
        ← All modules
      </Link>
    </div>
  );
}
