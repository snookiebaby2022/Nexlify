import Link from "next/link";

const items = [
  { href: "/admin/management/tools/channel-order", label: "Channel order", desc: "Reorder live channels in playlists" },
  { href: "/admin/management/tools/stream-tools", label: "Stream tools", desc: "Cache flush and stream utilities" },
  { href: "/admin/management/tools/provider-urls", label: "Provider URL tools", desc: "Bulk update provider and stream URLs" },
  { href: "/admin/management/tools/fingerprint", label: "Fingerprint", desc: "Anti-restream signing options" },
  { href: "/admin/management/tools/mass-delete", label: "Mass delete", desc: "Bulk delete streams, lines, users" },
  { href: "/admin/import/transfer", label: "Panel transfer", desc: "Export or import lines, streams, resellers between Nexlify panels" },
  { href: "/admin/import/migrate", label: "Panel migration", desc: "Import from XUI, 1-stream, Xtream UI, Midnight" },
  { href: "/admin/servers/install", label: "Server install wizard", desc: "SSH bootstrap + stream agent" },
  { href: "/admin/theft_detection", label: "Theft detection", desc: "Shared-IP alerts and auto-disable" },
  { href: "/admin/integrations/plex", label: "Plex import", desc: "Plex library → VOD streams" },
  { href: "/admin/integrations/emby", label: "Emby", desc: "Emby library → VOD streams" },
  { href: "/admin/integrations/jellyfin", label: "Jellyfin", desc: "Jellyfin library → VOD streams" },
  { href: "/admin/integrations/youtube", label: "YouTube", desc: "Channel as live stream entry" },
];

export default function ToolsHubPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tools</h1>
      <p className="text-sm opacity-70">Utilities for migration, streams, and integrations.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-lg p-4 transition hover:opacity-90"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <span className="font-medium">{item.label}</span>
              <p className="mt-1 text-sm opacity-70">{item.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
