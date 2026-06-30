import type { ReactNode } from "react";
import { LayoutDashboard, Megaphone, Tv, Wifi, Wrench } from "lucide-react";
import { CONTENT_FOLDERS } from "@/lib/content-folders";
import { coloredGroupIcon, coloredIcon } from "@/lib/nav-item-icons";

export type SidebarNavItem = { href: string; label: string; section?: string; icon?: ReactNode };

export type SidebarNavGroup = {
  id: string;
  label: string;
  icon: ReactNode;
  items: SidebarNavItem[];
};

export type SidebarNavLink = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Open in a new browser tab (e.g. web player). */
  openInNewTab?: boolean;
};

export type SidebarNavEntry =
  | { kind: "link"; link: SidebarNavLink }
  | { kind: "group"; group: SidebarNavGroup };

const LIVE_NAV_FOLDERS = CONTENT_FOLDERS.filter(
  (f) =>
    f.slug !== "vod" &&
    f.slug !== "epg" &&
    f.slug !== "created" &&
    f.slug !== "archive" &&
    f.slug !== "delayed"
);

/** XUI-style panel navigation (admin). Used for horizontal top bar. */
export function getAdminSidebarNav(): SidebarNavEntry[] {
  return [
    {
      kind: "link",
      link: {
        href: "/admin/dashboard",
        label: "Dashboard",
        icon: coloredIcon(LayoutDashboard, "#38bdf8", 18),
      },
    },
    {
      kind: "link",
      link: {
        href: "/admin/connections",
        label: "Live Connections",
        icon: coloredIcon(Wifi, "#22d3ee", 18),
      },
    },
    {
      kind: "link",
      link: {
        href: "/webplayer",
        label: "Web Player",
        icon: coloredIcon(Tv, "#a78bfa", 18),
        openInNewTab: true,
      },
    },
    {
      kind: "group",
      group: {
        id: "subscriptions",
        label: "Subscriptions",
        icon: coloredGroupIcon("subscriptions"),
        items: [
          { href: "/admin/lines/add", label: "Add Line", section: "Lines" },
          { href: "/admin/lines/add-package", label: "Add Line (with Package)", section: "Lines" },
          { href: "/admin/lines", label: "Manage Lines", section: "Lines" },
          { href: "/admin/lines/mass-edit", label: "Mass Edit Lines", section: "Lines" },
          { href: "/admin/line_activity", label: "Line Activity", section: "Lines" },
          { href: "/admin/devices", label: "MAG & Enigma2 Center", section: "Devices" },
          { href: "/admin/mag/add", label: "Add MAG Device", section: "MAG Device" },
          { href: "/admin/mag/add?package=1", label: "Add MAG Device (with Package)", section: "MAG Device" },
          { href: "/admin/mag/bulk", label: "Bulk Add MAG Devices", section: "MAG Device" },
          { href: "/admin/mag", label: "Manage MAG Devices", section: "MAG Device" },
          { href: "/admin/mag/convert-to-line", label: "Convert MAG Devices to Line", section: "MAG Device" },
          { href: "/admin/enigmas/add", label: "Add Enigma2 Device", section: "Enigma2" },
          { href: "/admin/enigmas/add?package=1", label: "Add Enigma2 Device (with Package)", section: "Enigma2" },
          { href: "/admin/enigmas", label: "Manage Enigma2 Devices", section: "Enigma2" },
          { href: "/admin/enigmas/bouquet-tools", label: "Enigma2 Bouquet Scripts", section: "Enigma2" },
          { href: "/admin/mag_events", label: "Manage Devices Events", section: "Device Events" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "streaming-servers",
        label: "Streaming Servers",
        icon: coloredGroupIcon("streaming-servers"),
        items: [
          { href: "/admin/servers/add", label: "Add Server" },
          { href: "/admin/servers", label: "Manage Servers" },
          { href: "/admin/servers/resource-charts", label: "Resource Charts" },
          { href: "/admin/servers/load-balancer", label: "Load Balancer" },
          { href: "/admin/servers/nginx-config", label: "Recommended nginx config" },
          { href: "/admin/servers/install", label: "Server Install Wizard" },
          { href: "/admin/process_monitor", label: "Process Monitor" },
          { href: "/admin/settings/cache", label: "Cache / Redis" },
          { href: "/admin/streaming/engine", label: "Streaming Engine" },
          { href: "/admin/streaming/transcoding", label: "Transcoding Studio" },
          { href: "/admin/streaming/health", label: "Streaming Health" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "proxies",
        label: "Proxies",
        icon: coloredGroupIcon("proxies"),
        items: [
          { href: "/admin/servers/proxies#add-proxy", label: "Add Proxy" },
          { href: "/admin/servers/proxies", label: "Manage Proxies" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "rtmp",
        label: "RTMP Management",
        icon: coloredGroupIcon("rtmp"),
        items: [{ href: "/admin/management/rtmp-ips", label: "RTMP IPs" }],
      },
    },
    {
      kind: "group",
      group: {
        id: "live",
        label: "Live / Radio / Channel",
        icon: coloredGroupIcon("live"),
        items: [
          { href: "/admin/streams/add", label: "Add Stream", section: "Live" },
          { href: "/admin/content/streams", label: "Manage Streams", section: "Live" },
          { href: "/admin/categories", label: "Categories", section: "Live" },
          ...LIVE_NAV_FOLDERS.filter((f) => f.slug !== "streams").map((f) => ({
            href: `/admin/content/${f.slug}`,
            label: f.title,
            section: "Folders" as const,
          })),
          { href: "/admin/import/m3u", label: "Import M3U", section: "Import" },
          { href: "/admin/import/m3u/review", label: "M3U Stream Review", section: "Import" },
          { href: "/admin/streaming/health", label: "Streaming Health", section: "Import" },
          { href: "/admin/radios", label: "Radio Stations", section: "Radio" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "created-channels",
        label: "Create 24/7 Channel",
        icon: coloredGroupIcon("live"),
        items: [
          { href: "/admin/created_channels/add", label: "Create Channel" },
          { href: "/admin/created_channels", label: "Manage Created Channels" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "epg",
        label: "EPG",
        icon: coloredGroupIcon("epg"),
        items: [
          { href: "/admin/epg/sources", label: "EPG Sources" },
          { href: "/admin/epg/add", label: "Add EPG Source" },
          { href: "/admin/epg/channels", label: "EPG Channel Map" },
          { href: "/admin/epg/countries", label: "All Countries" },
          { href: "/admin/epg/calendar", label: "EPG Calendar" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "vods",
        label: "VOD",
        icon: coloredGroupIcon("vods"),
        items: [
          { href: "/admin/content/movies/add", label: "Add Movie", section: "Movies" },
          { href: "/admin/content/movies", label: "Manage Movies", section: "Movies" },
          { href: "/admin/content/series/add", label: "Add Series", section: "TV Series" },
          { href: "/admin/content/series", label: "Manage Series", section: "TV Series" },
          { href: "/admin/content/episodes/add", label: "Add Episode", section: "Episodes" },
          { href: "/admin/content/episodes", label: "Manage Episodes", section: "Episodes" },
          { href: "/admin/content/vod", label: "VOD browser", section: "Library" },
          { href: "/admin/management/stream-providers", label: "VOD Providers", section: "Library" },
          { href: "/admin/watch-folders", label: "Watch Folders", section: "Library" },
          { href: "/admin/import/movies", label: "Import Movies", section: "Import" },
          { href: "/admin/import/series", label: "Import Series", section: "Import" },
          { href: "/admin/queue", label: "Import Queue", section: "Import" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "bouquets",
        label: "Bouquets",
        icon: coloredGroupIcon("bouquets"),
        items: [
          { href: "/admin/bouquets/add", label: "Add Bouquet" },
          { href: "/admin/bouquets", label: "Manage Bouquets" },
          { href: "/admin/bouquets/order", label: "Order Bouquets" },
          { href: "/admin/bouquets/templates", label: "Bouquet Templates" },
          { href: "/admin/resellers/bouquets", label: "Bouquet Access" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "users",
        label: "Registered Users",
        icon: coloredGroupIcon("users"),
        items: [
          { href: "/admin/resellers/add", label: "Add User", section: "Users" },
          { href: "/admin/resellers", label: "Manage Users", section: "Users" },
          { href: "/admin/resellers/sub", label: "Sub-Resellers" },
          { href: "/admin/management/groups", label: "User Groups" },
          { href: "/admin/management/groups/add", label: "Add Group" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "packages",
        label: "Packages",
        icon: coloredGroupIcon("packages"),
        items: [
          { href: "/admin/management/packages/add", label: "Add Package" },
          { href: "/admin/management/packages", label: "Manage Packages" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "statistics",
        label: "Statistics",
        icon: coloredGroupIcon("statistics"),
        items: [
          { href: "/admin/connections", label: "Live Connections" },
          { href: "/admin/videolog", label: "VideoLog" },
          { href: "/admin/stream_rank", label: "Top Channels" },
          { href: "/admin/line_activity", label: "Line Activity" },
          { href: "/admin/resellers/credits", label: "Credit Log" },
          { href: "/admin/theft_detection", label: "Theft Detection" },
          { href: "/admin/stream_health", label: "Stream Health" },
          { href: "/admin/reports/usage", label: "Usage Reports" },
          { href: "/admin/reports/commission", label: "Commission Report" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "analytics",
        label: "Analytics",
        icon: coloredGroupIcon("analytics"),
        items: [
          { href: "/admin/analytics", label: "Dashboard" },
          { href: "/admin/analytics/insights", label: "AI Insights" },
          { href: "/admin/analytics/bandwidth", label: "Bandwidth Over Time" },
          { href: "/admin/analytics/viewer-heatmap", label: "Viewer Geography" },
          { href: "/admin/analytics/pdf", label: "Export Reports" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "security",
        label: "Security",
        icon: coloredGroupIcon("security"),
        items: [
          { href: "/admin/settings/security", label: "Security Settings" },
          { href: "/admin/settings/server-guard", label: "Server Guard" },
          { href: "/admin/settings/device-binding", label: "Device Binding" },
          { href: "/admin/settings/stream-fingerprint", label: "Stream Fingerprint" },
          { href: "/admin/settings/same-ip-detection", label: "Same-IP Detection" },
          { href: "/admin/settings/apps-lock", label: "Apps Lock" },
          { href: "/admin/settings/vod-proxy", label: "Hide VOD URLs" },
          { href: "/admin/settings/fingerprint", label: "Playback Fingerprint" },
          { href: "/admin/settings/cdn-ips", label: "Cloudflare & Bunny IPs" },
          { href: "/admin/management/blocked-ips", label: "Blocked IPs" },
          { href: "/admin/management/blocked-isps", label: "Blocked ISPs" },
          { href: "/admin/management/blocked-asns", label: "Blocked ASNs" },
          { href: "/admin/management/blocked-user-agents", label: "Blocked User Agents" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "logs",
        label: "Logs",
        icon: coloredGroupIcon("logs"),
        items: [
          { href: "/admin/management/logs", label: "Panel Logs" },
          { href: "/admin/streams/logs", label: "Stream Logs" },
          { href: "/admin/stream_errors", label: "Stream Errors" },
          { href: "/admin/resellers/credits", label: "Credit Transactions" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "streaming-tools",
        label: "Streaming Tools",
        icon: coloredGroupIcon("streaming-tools"),
        items: [
          { href: "/admin/management/tools", label: "Tools Home" },
          { href: "/admin/management/tools/channel-order", label: "Channel Order" },
          { href: "/admin/management/tools/stream-tools", label: "Stream Tools" },
          { href: "/admin/management/tools/provider-urls", label: "Provider URL Tools" },
          { href: "/admin/management/tools/bulk-backup-urls", label: "Bulk Backup Sources" },
          { href: "/admin/management/tools/mass-delete", label: "Mass Delete" },
          { href: "/admin/management/mass-edit", label: "Mass Edit" },
          { href: "/admin/management/categories", label: "Categories" },
          { href: "/admin/import/migrate", label: "Panel Migration" },
          { href: "/admin/import/m3u", label: "M3U Import" },
          { href: "/admin/import/transfer", label: "Panel Transfer" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "tickets",
        label: "Tickets",
        icon: coloredGroupIcon("tickets"),
        items: [
          { href: "/admin/tickets", label: "All Tickets" },
          { href: "/admin/tickets/new", label: "Create Ticket" },
        ],
      },
    },
    {
      kind: "link",
      link: {
        href: "/admin/notifications",
        label: "Announcements",
        icon: coloredIcon(Megaphone, "#fbbf24", 18),
      },
    },
    {
      kind: "group",
      group: {
        id: "service-setup",
        label: "Service Setup",
        icon: coloredIcon(Wrench, "#38bdf8", 18),
        items: [
          { href: "/admin/service-setup", label: "Setup overview", section: "Start here" },
          { href: "/admin/settings/general", label: "General settings", section: "Panel" },
          { href: "/admin/settings/server", label: "Server & ports", section: "Panel" },
          { href: "/admin/settings/domains", label: "Domains & SSL", section: "Panel" },
          { href: "/admin/settings/binaries", label: "FFmpeg & binaries", section: "Panel" },
          { href: "/admin/settings/billing", label: "WHMCS & billing", section: "Billing" },
          { href: "/admin/settings/notifications", label: "Email & SMTP", section: "Billing" },
          { href: "/admin/epg/sources", label: "EPG sources", section: "Content" },
          { href: "/admin/settings/tmdb", label: "TMDB metadata", section: "Content" },
          { href: "/admin/bouquets/templates", label: "Bouquet templates", section: "Content" },
          { href: "/admin/devices", label: "MAG & Enigma2", section: "Devices" },
          { href: "/admin/servers/install", label: "Install stream server", section: "Servers" },
          { href: "/admin/import/migrate", label: "Panel migration", section: "Import" },
          { href: "/admin/settings/cron", label: "Scheduled tasks", section: "Maintenance" },
          { href: "/admin/settings/updates", label: "Panel update", section: "Maintenance" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "settings",
        label: "Settings",
        icon: coloredGroupIcon("settings"),
        items: [
          { href: "/admin/settings/general", label: "General", section: "Panel" },
          { href: "/admin/settings/general#live-sports", label: "Live Sports APIs", section: "Panel" },
          { href: "/admin/settings/community", label: "Community & Chat", section: "Panel" },
          { href: "/admin/settings/streams", label: "Streaming", section: "Panel" },
          { href: "/admin/settings/server", label: "Server & Port", section: "Panel" },
          { href: "/admin/settings/domains", label: "Domains & SSL", section: "Panel" },
          { href: "/admin/settings/binaries", label: "Server Binaries", section: "Panel" },
          { href: "/admin/settings/player", label: "Player & CDM", section: "Panel" },
          { href: "/admin/settings/webrtc", label: "WebRTC", section: "Panel" },
          { href: "/admin/settings/cache", label: "Cache & Redis", section: "Panel" },
          { href: "/admin/settings/backup", label: "Backup", section: "Panel" },
          { href: "/admin/settings/geo", label: "Geo & Country", section: "Panel" },
          { href: "/admin/settings/tmdb", label: "TMDB", section: "Panel" },
          { href: "/admin/settings/notifications", label: "Notifications", section: "Panel" },
          { href: "/admin/settings/monitoring", label: "Monitoring & Telegram", section: "Panel" },
          { href: "/admin/settings/billing", label: "Billing & PayPal", section: "Panel" },
          { href: "/admin/settings/catchup", label: "Catch-up TV", section: "Panel" },
          { href: "/admin/settings/white-label", label: "White-label Portal", section: "Panel" },
          { href: "/admin/settings/server-guard", label: "Server Guard", section: "Security" },
          { href: "/admin/settings/device-binding", label: "Device Binding", section: "Security" },
          { href: "/admin/settings/stream-fingerprint", label: "Stream Fingerprint", section: "Security" },
          { href: "/admin/settings/same-ip-detection", label: "Same-IP Detection", section: "Security" },
          { href: "/admin/settings/performance-core", label: "Performance Core", section: "Performance" },
          { href: "/admin/settings/auto-fix", label: "Auto Issue Fix", section: "Performance" },
          { href: "/admin/settings/lb-redirect", label: "Secure LB Redirect", section: "Security" },
          { href: "/admin/settings/cloud-backup", label: "Cloud Backup", section: "Data" },
          { href: "/admin/settings/server-cleaner", label: "Server Cleaner", section: "Maintenance" },
          { href: "/admin/settings/vod-proxy", label: "Hide VOD Source", section: "Security" },
          { href: "/admin/settings/apps-lock", label: "Apps Lock", section: "Security" },
          { href: "/admin/settings/stream-analyzer", label: "Stream Analyzer", section: "Performance" },
          { href: "/admin/settings/source-swap", label: "Source Swap", section: "Performance" },
          { href: "/admin/settings/source-monitor", label: "Source Monitor", section: "Performance" },
          { href: "/admin/settings/prefix-manager", label: "Prefix Manager", section: "Branding" },
          { href: "/admin/settings/batch-manager", label: "Batch Manager", section: "Tools" },
          { href: "/admin/settings/expiry-videos", label: "Expiry Videos", section: "Branding" },
          { href: "/admin/settings/disk-monitor", label: "Disk Monitor", section: "Maintenance" },
          { href: "/admin/settings/cron", label: "Scheduled tasks", section: "Panel" },
          { href: "/admin/profile", label: "My Profile", section: "Account" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "updates",
        label: "Updates",
        icon: coloredGroupIcon("updates"),
        items: [
          { href: "/admin/settings/updates", label: "Panel Update" },
          { href: "/admin/panels", label: "Registered Panels" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "license",
        label: "License",
        icon: coloredGroupIcon("license"),
        items: [
          { href: "/admin/license/show", label: "Show License" },
          { href: "/admin/license/add", label: "Add License" },
          { href: "/admin/license/renew", label: "Renew License" },
          { href: "/admin/license/addon", label: "Addon Licenses" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "addons",
        label: "Addons",
        icon: coloredGroupIcon("addons"),
        items: [
          { href: "/admin/addons", label: "Overview" },
          { href: "/admin/marketplace", label: "Feature Packs" },
          { href: "/admin/integrations/spotify", label: "Spotify" },
          { href: "/admin/integrations/apple-music", label: "Apple Music" },
          { href: "/admin/integrations/deezer", label: "Deezer" },
          { href: "/admin/integrations/youtube-music", label: "YouTube Music" },
          { href: "/admin/integrations/plex", label: "Plex" },
          { href: "/admin/integrations/emby", label: "Emby" },
          { href: "/admin/integrations/jellyfin", label: "Jellyfin" },
          { href: "/admin/integrations/youtube", label: "YouTube" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "app-builder",
        label: "App Builder",
        icon: coloredGroupIcon("app-builder"),
        items: [
          { href: "/admin/app-builder", label: "Build Branded APK" },
        ],
      },
    },
  ];
}
