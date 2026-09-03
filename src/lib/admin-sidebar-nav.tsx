import type { ReactNode } from "react";
import { LayoutDashboard, Megaphone, Search, Wifi } from "lucide-react";
import { CONTENT_FOLDERS } from "@/lib/content-folders";
import { coloredGroupIcon, coloredIcon } from "@/lib/nav-item-icons";

export type SidebarNavItem = {
  href: string;
  label: string;
  section?: string;
  icon?: ReactNode;
  keywords?: string;
};

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

/** Compact XUI-style admin nav — one place per job, sections for sub-pages. */
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
        href: "/admin/find",
        label: "Find a feature",
        icon: coloredIcon(Search, "#a3e635", 18),
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
      kind: "group",
      group: {
        id: "diagnostics",
        label: "Diagnostics",
        icon: coloredGroupIcon("diagnostics"),
        items: [
          { href: "/admin/diagnostics", label: "Panel diagnostics", section: "Hub", keywords: "fix recover probe reboot health nginx" },
          { href: "/admin/content/streams?status=offline", label: "Stream errors", section: "Streams" },
          { href: "/admin/streaming/health", label: "Streaming health", section: "Streams" },
          { href: "/admin/connections", label: "Live connections", section: "Clients" },
          { href: "/admin/servers", label: "Servers", section: "Servers" },
          { href: "/admin/process_monitor", label: "Process monitor", section: "Servers" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "lines",
        label: "Lines",
        icon: coloredGroupIcon("subscriptions"),
        items: [
          { href: "/admin/lines/add", label: "Add Line", section: "Lines" },
          { href: "/admin/lines", label: "Manage Lines", section: "Lines" },
          { href: "/admin/lines/mass-edit", label: "Mass Edit", section: "Lines" },
          { href: "/admin/line_activity", label: "Line Activity", section: "Lines" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "devices",
        label: "Devices",
        icon: coloredGroupIcon("subscriptions"),
        items: [
          { href: "/admin/devices", label: "MAG & Enigma2 Center", section: "Overview" },
          { href: "/admin/mag/add", label: "Add MAG", section: "MAG" },
          { href: "/admin/mag/bulk", label: "Bulk Add MAG", section: "MAG" },
          { href: "/admin/mag", label: "Manage MAG", section: "MAG" },
          { href: "/admin/mag/convert-to-line", label: "Convert MAG to Line", section: "MAG" },
          { href: "/admin/enigmas/add", label: "Add Enigma2", section: "Enigma2" },
          { href: "/admin/enigmas", label: "Manage Enigma2", section: "Enigma2" },
          { href: "/admin/enigmas/bouquet-tools", label: "Bouquet Scripts", section: "Enigma2" },
          { href: "/admin/mag_events", label: "Device Events", section: "Events" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "servers",
        label: "Servers",
        icon: coloredGroupIcon("streaming-servers"),
        items: [
          { href: "/admin/servers/add", label: "Add Server", section: "Servers" },
          { href: "/admin/servers", label: "Manage Servers", section: "Servers" },
          { href: "/admin/servers/load-balancer", label: "Load Balancer", section: "Servers" },
          { href: "/admin/servers/resource-charts", label: "Resource Charts", section: "Servers" },
          { href: "/admin/auto-scale", label: "Auto-Scale", section: "Servers" },
          { href: "/admin/servers/install", label: "Install Wizard", section: "Servers" },
          { href: "/admin/process_monitor", label: "Process Monitor", section: "Servers" },
          { href: "/admin/servers/proxies", label: "Proxies", section: "Edge" },
          { href: "/admin/management/rtmp-ips", label: "RTMP IPs", section: "Edge" },
          { href: "/admin/streaming/engine", label: "Streaming Engine", section: "Engine" },
          { href: "/admin/streaming/transcoding", label: "Transcoding", section: "Engine" },
          { href: "/admin/streaming/health", label: "Streaming Health", section: "Engine" },
          { href: "/admin/streaming/smart-cdn", label: "Smart CDN", section: "Engine" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "live",
        label: "Live TV",
        icon: coloredGroupIcon("live"),
        items: [
          { href: "/admin/streams/add", label: "Add Stream", section: "Streams" },
          { href: "/admin/streams/capture", label: "Capture / CCTV", section: "Streams", keywords: "hdmi v4l2 dshow ingest xui" },
          { href: "/admin/content/streams", label: "Manage Streams", section: "Streams" },
          { href: "/admin/whats-on", label: "What’s on now", section: "Streams", keywords: "watch party fixtures epg now playing" },
          ...LIVE_NAV_FOLDERS.filter((f) => f.slug !== "streams").map((f) => ({
            href: `/admin/content/${f.slug}`,
            label: f.title,
            section: "Folders" as const,
          })),
          { href: "/admin/radios", label: "Radio", section: "Streams" },
          { href: "/admin/created_channels", label: "24/7 Channels", section: "Streams" },
          { href: "/admin/import/m3u", label: "Import M3U", section: "Providers" },
          { href: "/admin/import/m3u/review", label: "M3U Review", section: "Providers" },
          { href: "/admin/management/stream-providers", label: "Providers", section: "Providers" },
          { href: "/admin/m3u-sync", label: "M3U Auto-Sync", section: "Providers" },
          { href: "/admin/watch-folders", label: "Watch Folders", section: "Providers" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "vod",
        label: "VOD",
        icon: coloredGroupIcon("vods"),
        items: [
          { href: "/admin/content/movies/add", label: "Add Movie", section: "Movies" },
          { href: "/admin/content/movies", label: "Manage Movies", section: "Movies" },
          { href: "/admin/content/series/add", label: "Add Series", section: "Series" },
          { href: "/admin/content/series", label: "Manage Series", section: "Series" },
          { href: "/admin/content/episodes/add", label: "Add Episode", section: "Episodes" },
          { href: "/admin/content/episodes", label: "Manage Episodes", section: "Episodes" },
          { href: "/admin/content/vod", label: "VOD Browser", section: "Library" },
          { href: "/admin/import/movies", label: "Import Movies", section: "Import" },
          { href: "/admin/import/series", label: "Import Series", section: "Import" },
          { href: "/admin/queue", label: "Import Queue", section: "Import" },
          { href: "/admin/settings/vod-storage", label: "Rclone / S3 storage", section: "Library" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "categories",
        label: "Categories",
        icon: coloredGroupIcon("live"),
        items: [
          { href: "/admin/categories?type=LIVE", label: "Live TV", section: "By type" },
          { href: "/admin/categories?type=MOVIE", label: "Movies", section: "By type" },
          { href: "/admin/categories?type=SERIES", label: "TV Series", section: "By type" },
          { href: "/admin/categories?type=RADIO", label: "Radio", section: "By type" },
          { href: "/admin/categories", label: "All + tree search", section: "By type" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "bouquets",
        label: "Bouquets",
        icon: coloredGroupIcon("live"),
        items: [
          { href: "/admin/bouquets/add", label: "Add Bouquet", section: "Bouquets" },
          { href: "/admin/bouquets", label: "Manage Bouquets", section: "Bouquets" },
          { href: "/admin/bouquets/order", label: "Order Bouquets", section: "Bouquets" },
          { href: "/admin/bouquets/templates", label: "Templates", section: "Bouquets" },
          { href: "/admin/resellers/bouquets", label: "Reseller Access", section: "Bouquets" },
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
          { href: "/admin/epg/manage", label: "Manage EPG", section: "Guide" },
          { href: "/admin/epg/auto-match", label: "Auto-Match", section: "Guide" },
          { href: "/admin/epg/missing", label: "Missing EPG", section: "Guide" },
          { href: "/admin/epg/sources", label: "Sources", section: "Guide" },
          { href: "/admin/epg/add", label: "Add Source", section: "Guide" },
          { href: "/admin/epg/channels", label: "Channel Map", section: "Guide" },
          { href: "/admin/epg/calendar", label: "Calendar", section: "Guide" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "resellers",
        label: "Resellers",
        icon: coloredGroupIcon("users"),
        items: [
          { href: "/admin/resellers/add", label: "Add User", section: "Users" },
          { href: "/admin/resellers", label: "Manage Users", section: "Users" },
          { href: "/admin/resellers/sub", label: "Sub-Resellers", section: "Users" },
          { href: "/admin/management/groups", label: "User Groups", section: "Users" },
          { href: "/admin/management/packages", label: "Packages & markup", section: "Packages" },
          { href: "/admin/management/packages/add", label: "Add Package", section: "Packages" },
          { href: "/admin/resellers/credits", label: "Credit Log", section: "Credits" },
          { href: "/admin/shop", label: "Customer shop", section: "Shop", keywords: "storefront stripe paypal" },
          { href: "/admin/settings/billing", label: "Reseller rewards", section: "Shop", keywords: "cashback reward plugin credit rebate" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "stats",
        label: "Statistics",
        icon: coloredGroupIcon("statistics"),
        items: [
          { href: "/admin/videolog", label: "VideoLog", section: "Reports" },
          { href: "/admin/stream_rank", label: "Top Channels", section: "Reports" },
          { href: "/admin/content/streams?status=offline&sourceIssue=unstable", label: "Stream Health", section: "Reports" },
          { href: "/admin/theft_detection", label: "Theft Detection", section: "Reports" },
          { href: "/admin/reports/usage", label: "Usage", section: "Reports" },
          { href: "/admin/reports/commission", label: "Commission", section: "Reports" },
          { href: "/admin/analytics", label: "Analytics", section: "Analytics" },
          { href: "/admin/analytics/bandwidth", label: "Bandwidth", section: "Analytics" },
          { href: "/admin/dvr", label: "DVR Library", section: "DVR" },
          { href: "/admin/settings/catchup", label: "Catch-up TV", section: "DVR" },
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
          { href: "/admin/settings/security", label: "Security Settings", section: "Locks", keywords: "2fa totp generate reseller logins" },
          { href: "/admin/settings/security-shield", label: "VPN / proxy shield", section: "Locks", keywords: "ipqs datacenter tor autoblock" },
          { href: "/admin/settings/server-guard", label: "Server Guard", section: "Locks" },
          { href: "/admin/settings/device-binding", label: "Device Binding", section: "Locks" },
          { href: "/admin/settings/apps-lock", label: "Apps Lock", section: "Locks" },
          { href: "/admin/settings/fingerprint", label: "Playback Fingerprint", section: "Fingerprint", keywords: "overlay watermark drawtext leak" },
          { href: "/admin/settings/stream-fingerprint", label: "Stream Fingerprint", section: "Fingerprint" },
          { href: "/admin/settings/same-ip-detection", label: "Same-IP Detection", section: "Locks" },
          { href: "/admin/settings/vod-proxy", label: "Hide VOD URLs", section: "Locks" },
          { href: "/admin/management/blocked-ips", label: "Blocked IPs", section: "Blocks" },
          { href: "/admin/management/blocked-isps", label: "Blocked ISPs", section: "Blocks" },
          { href: "/admin/management/blocked-asns", label: "Blocked ASNs", section: "Blocks" },
          { href: "/admin/management/blocked-user-agents", label: "Blocked User Agents", section: "Blocks" },
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
          { href: "/admin/client_logs", label: "Client Logs" },
          { href: "/admin/login_logs", label: "Login Logs" },
          { href: "/admin/restream_logs", label: "Restream Logs" },
          { href: "/admin/streams/logs", label: "Stream Logs" },
          { href: "/admin/content/streams?status=offline", label: "Stream Errors" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "tools",
        label: "Tools",
        icon: coloredGroupIcon("streaming-tools"),
        items: [
          { href: "/admin/management/mass-edit/streams", label: "Mass Edit Streams", section: "Mass edit" },
          { href: "/admin/management/mass-edit/movies", label: "Mass Edit Movies", section: "Mass edit" },
          { href: "/admin/management/mass-edit/series", label: "Mass Edit Series", section: "Mass edit" },
          { href: "/admin/management/mass-edit/users", label: "Mass Edit Users", section: "Mass edit" },
          { href: "/admin/management/tools/mass-delete", label: "Mass Delete", section: "Mass delete" },
          { href: "/admin/management/tools/remove-duplicates", label: "Remove Duplicates", section: "Cleanup" },
          { href: "/admin/management/tools/channel-order", label: "Channel Order", section: "Cleanup" },
          { href: "/admin/import/migrate", label: "Panel Migration", section: "Import" },
          { href: "/admin/import/transfer", label: "Panel Transfer", section: "Import" },
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
          { href: "/admin/tickets", label: "Open Tickets" },
          { href: "/admin/tickets?status=CLOSED", label: "Closed Tickets" },
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
        id: "settings",
        label: "Settings",
        icon: coloredGroupIcon("settings"),
        items: [
          { href: "/admin/settings/general", label: "General", section: "Panel" },
          { href: "/admin/settings/server", label: "Server & ports", section: "Panel" },
          { href: "/admin/settings/domains", label: "Domains & SSL", section: "Panel" },
          { href: "/admin/settings/binaries", label: "FFmpeg", section: "Panel" },
          { href: "/admin/settings/cache", label: "Cache / Redis", section: "Panel" },
          { href: "/admin/settings/billing", label: "Billing & PayPal", section: "Billing" },
          { href: "/admin/settings/api", label: "Admin API", section: "Billing", keywords: "create_line hmac xui billing" },
          { href: "/admin/settings/notifications", label: "Email & SMTP", section: "Billing" },
          { href: "/admin/settings/tmdb", label: "TMDB", section: "Content" },
          { href: "/admin/settings/cron", label: "Scheduled tasks", section: "Maintenance" },
          { href: "/admin/settings/backup", label: "Backup", section: "Maintenance" },
          { href: "/admin/settings/updates", label: "Panel update", section: "Maintenance" },
          { href: "/admin/settings/white-label", label: "White-label", section: "Branding" },
          { href: "/admin/player/multiview", label: "Multi-view player", section: "Branding", keywords: "grid webplayer 1-stream" },
          { href: "/admin/profile", label: "My Profile", section: "Account" },
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
          { href: "/admin/ai", label: "AI Hub", section: "AI" },
          { href: "/admin/marketplace", label: "Feature Packs", section: "Packs" },
          { href: "/admin/integrations/plex", label: "Plex", section: "Libraries" },
          { href: "/admin/integrations/emby", label: "Emby", section: "Libraries" },
          { href: "/admin/integrations/jellyfin", label: "Jellyfin", section: "Libraries" },
          { href: "/admin/app-builder", label: "Branded APK", section: "Apps" },
          { href: "/admin/license/show", label: "License", section: "License" },
        ],
      },
    },
  ];
}
