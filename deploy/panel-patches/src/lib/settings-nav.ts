import type { SettingGroup } from "@/lib/panel-settings";

export type SettingsNavItem = {
  href: string;
  label: string;
  group?: SettingGroup;
};

export const SETTINGS_NAV: SettingsNavItem[] = [
  { href: "/admin/settings/general", label: "General", group: "general" },
  { href: "/admin/settings/community", label: "Community & chat", group: "community" },
  { href: "/admin/settings/streams", label: "Streaming", group: "streams" },
  { href: "/admin/settings/binaries", label: "Server binaries", group: "binaries" },
  { href: "/admin/settings/cache", label: "Cache & Redis", group: "cache" },
  { href: "/admin/settings/backup", label: "Backup", group: "backup" },
  { href: "/admin/settings/tmdb", label: "TMDB / Metadata", group: "tmdb" },
  { href: "/admin/settings/notifications", label: "Notifications", group: "notifications" },
  { href: "/admin/settings/server", label: "Server & port", group: "server" },
  { href: "/admin/settings/updates", label: "Panel update", group: "server" },
  { href: "/admin/settings/domains", label: "Domains & SSL", group: "domains" },
  { href: "/admin/settings/security", label: "Security", group: "security" },
  { href: "/admin/settings/fingerprint", label: "Fingerprint", group: "fingerprint" },
  { href: "/admin/settings/geo", label: "Geo & country", group: "geo" },
  { href: "/admin/settings/player", label: "Player & CDM", group: "player" },
  { href: "/admin/profile", label: "Profile & avatar" },
];
