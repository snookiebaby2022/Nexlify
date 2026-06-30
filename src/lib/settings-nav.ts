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
  { href: "/admin/settings/monitoring", label: "Monitoring & Telegram", group: "monitoring" },
  { href: "/admin/settings/billing", label: "Billing & PayPal", group: "billing" },
  { href: "/admin/settings/cron", label: "Scheduled tasks", group: "cron" },
  { href: "/admin/settings/server", label: "Server & port", group: "server" },
  { href: "/admin/settings/updates", label: "Panel update", group: "server" },
  { href: "/admin/settings/domains", label: "Domains & SSL", group: "domains" },
  { href: "/admin/settings/security", label: "Security", group: "security" },
  { href: "/admin/settings/server-guard", label: "Server Guard", group: "server-guard" },
  { href: "/admin/settings/performance-core", label: "Performance Core", group: "performance-core" },
  { href: "/admin/settings/fingerprint", label: "Fingerprint", group: "fingerprint" },
  { href: "/admin/settings/device-binding", label: "Device Bindings", group: "security" },
  { href: "/admin/settings/stream-fingerprint", label: "Stream Fingerprint", group: "security" },
  { href: "/admin/settings/same-ip-detection", label: "Same-IP Detection", group: "security" },
  { href: "/admin/settings/apps-lock", label: "Apps Lock", group: "apps-lock" },
  { href: "/admin/settings/vod-proxy", label: "Hide VOD URLs", group: "vod-proxy" },
  { href: "/admin/settings/batch-manager", label: "Batch Manager", group: "batch-manager" },
  { href: "/admin/settings/expiry-videos", label: "Expiry Videos", group: "expiry-videos" },
  { href: "/admin/settings/server-cleaner", label: "Server Cleaner", group: "server-cleaner" },
  { href: "/admin/settings/disk-monitor", label: "Disk Monitor", group: "disk-monitor" },
  { href: "/admin/settings/prefix-manager", label: "Prefix Manager", group: "prefix-manager" },
  { href: "/admin/settings/lb-sessions", label: "LB Sessions", group: "server" },
  { href: "/admin/settings/mass-edit", label: "Mass Edit", group: "server" },
  { href: "/admin/settings/migration", label: "Migration", group: "server" },
  { href: "/admin/settings/geo", label: "Geo & country", group: "geo" },
  { href: "/admin/settings/player", label: "Player & CDM", group: "player" },
  { href: "/admin/settings/webrtc", label: "WebRTC", group: "webrtc" },
  { href: "/admin/marketplace", label: "Feature packs" },
  { href: "/admin/profile", label: "Profile & avatar" },
];
