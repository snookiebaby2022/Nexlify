import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  Bell,
  Box,
  Calendar,
  Clapperboard,
  Cloud,
  CreditCard,
  Database,
  Download,
  EyeOff,
  Film,
  Flower2,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  MessageSquare,
  Paintbrush,
  Send,
  Layers,
  LayoutDashboard,
  List,
  Lock,
  Monitor,
  Network,
  Package,
  Play,
  Plus,
  Puzzle,
  Radio,
  RefreshCw,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Trash2,
  Tv,
  Upload,
  User,
  UserPlus,
  Users,
  Video,
  Wifi,
  Wrench,
  Zap,
  Fingerprint,
  ListChecks,
  Smartphone,
} from "lucide-react";

const ICON_SIZE = 15;
const GROUP_ICON_SIZE = 18;

/** Colored Lucide icon for sidebar / menus. */
export function coloredIcon(Icon: LucideIcon, color: string, size = ICON_SIZE): ReactNode {
  return (
    <Icon
      size={size}
      className="shrink-0"
      style={{ color, stroke: color }}
      strokeWidth={2.25}
      aria-hidden
    />
  );
}

function colorForHref(href: string): string {
  if (href.includes("/dashboard")) return "#38bdf8";
  if (href.includes("/connections") || href.includes("/line_activity")) return "#22d3ee";
  if (href.includes("/lines")) return "#60a5fa";
  if (href.includes("/mag") || href.includes("/enigma")) return "#a78bfa";
  if (href.includes("/servers") || href.includes("/process_monitor")) return "#4ade80";
  if (href.includes("/proxies") || href.includes("/rtmp")) return "#2dd4bf";
  if (href.includes("/streams") || href.includes("/radios") || href.includes("/created_channel"))
    return "#f97316";
  if (href.includes("/content/") && !href.includes("/movies") && !href.includes("/series"))
    return "#fb923c";
  if (href.includes("/epg")) return "#c084fc";
  if (href.includes("/movies") || href.includes("/import/movies")) return "#f472b6";
  if (href.includes("/series") || href.includes("/import/series")) return "#e879f9";
  if (href.includes("/vod") || href.includes("/stream-providers") || href.includes("/watch-folders") || href.includes("/queue"))
    return "#ec4899";
  if (href.includes("/bouquet")) return "#fbbf24";
  if (href.includes("/reseller") || href.includes("/groups")) return "#818cf8";
  if (href.includes("/packages")) return "#34d399";
  if (href.includes("/theft") || href.includes("/blocked")) return "#f87171";
  if (href.includes("/service-setup")) return "#38bdf8";
  if (href.includes("/license") || href.includes("/addons") || href.includes("/integrations"))
    return "#a855f7";
  if (href.includes("/tickets")) return "#fcd34d";
  if (href.includes("/management/tools") || href.includes("/mass-delete") || href.includes("/mass-edit"))
    return "#f59e0b";
  if (href.includes("/import/migrate")) return "#06b6d4";
  if (href.includes("/logs") || href.includes("/stream_errors") || href.includes("/streams/logs"))
    return "#fca5a5";
  if (href.includes("/api")) return "#fde047";
  return "#7dd3fc";
}

const HREF_ICONS: Record<string, ReactNode> = {};

function registerIcons() {
  const entries: [string, LucideIcon][] = [
    ["/admin/dashboard", LayoutDashboard],
    ["/admin/connections", Wifi],
    ["/admin/lines/add", Plus],
    ["/admin/lines", Monitor],
    ["/admin/lines/mass-edit", List],
    ["/admin/line_activity", Activity],
    ["/admin/mag", Box],
    ["/admin/mag/add", Plus],
    ["/admin/mag/bulk", List],
    ["/admin/mag/convert-to-line", ArrowRightLeft],
    ["/admin/mag_events", Activity],
    ["/admin/enigmas", Box],
    ["/admin/enigmas/add", Plus],
    ["/admin/servers/add", Plus],
    ["/admin/servers", Server],
    ["/admin/servers/install", Download],
    ["/admin/process_monitor", Gauge],
    ["/admin/settings/cache", Database],
    ["/admin/servers/proxies", Network],
    ["/admin/management/rtmp-ips", Globe],
    ["/admin/management/tools/stream-tools", Wrench],
    ["/admin/streams/add", Plus],
    ["/admin/created_channels", Radio],
    ["/admin/radios", Radio],
    ["/admin/epg/sources", Tv],
    ["/admin/epg/add", Plus],
    ["/admin/epg/channels", List],
    ["/admin/epg/countries", Globe],
    ["/admin/epg", Tv],
    ["/admin/content/movies/add", Plus],
    ["/admin/content/vod", Film],
    ["/admin/content/movies", Film],
    ["/admin/content/series/add", Plus],
    ["/admin/content/series", Clapperboard],
    ["/admin/management/stream-providers", Cloud],
    ["/admin/import/movies", Upload],
    ["/admin/import/series", Upload],
    ["/admin/watch-folders", FolderOpen],
    ["/admin/queue", List],
    ["/admin/bouquets", Flower2],
    ["/admin/bouquets/add", Plus],
    ["/admin/bouquets/order", List],
    ["/admin/resellers/bouquets", Shield],
    ["/admin/resellers", Users],
    ["/admin/resellers/add", UserPlus],
    ["/admin/resellers/sub", Users],
    ["/admin/management/groups", Users],
    ["/admin/management/groups/add", Plus],
    ["/admin/management/packages", Package],
    ["/admin/management/packages/add", Plus],
    ["/admin/theft_detection", Shield],
    ["/admin/settings/security", Lock],
    ["/admin/settings/cdn-ips", Cloud],
    ["/admin/settings/fingerprint", Sparkles],
    ["/admin/management/blocked-ips", Shield],
    ["/admin/management/logs", List],
    ["/admin/streams/logs", List],
    ["/admin/stream_errors", Activity],
    ["/admin/management/tools", Wrench],
    ["/admin/management/tools/mass-delete", Trash2],
    ["/admin/settings/general", Settings],
    ["/admin/settings/community", MessageSquare],
    ["/admin/settings/streams", Play],
    ["/admin/settings/server", Server],
    ["/admin/settings/cache", Database],
    ["/admin/settings/security", Shield],
    ["/admin/settings/fingerprint", Sparkles],
    ["/admin/settings/domains", Globe],
    ["/admin/settings/binaries", Download],
    ["/admin/settings/player", Video],
    ["/admin/settings/backup", Database],
    ["/admin/settings/geo", Globe],
    ["/admin/settings/tmdb", Film],
    ["/admin/settings/notifications", Activity],
    ["/admin/settings/updates", RefreshCw],
    ["/admin/license/show", KeyRound],
    ["/admin/license/add", Plus],
    ["/admin/addons", Puzzle],
    ["/admin/api", Zap],
    ["/reseller/dashboard", LayoutDashboard],
    ["/reseller/lines", Monitor],
    ["/reseller/lines/add", Plus],
    ["/reseller/mags/add", Plus],
    ["/reseller/enigmas/add", Plus],
    ["/reseller/credits", CreditCard],
    ["/reseller/line_activity", Activity],
    ["/reseller/live_connections", Wifi],
    ["/reseller/mags", Box],
    ["/reseller/mags/bulk", List],
    ["/reseller/mags/convert-to-line", ArrowRightLeft],
    ["/reseller/mag_events", Activity],
    ["/reseller/streams", Plus],
    ["/reseller/radios", Radio],
    ["/reseller/epg_view", Tv],
    ["/reseller/users", Users],
    ["/reseller/tickets", List],
    ["/reseller/profile", Settings],
  ];
  for (const [href, Icon] of entries) {
    HREF_ICONS[href] = coloredIcon(Icon, colorForHref(href));
  }
}
registerIcons();

// New feature page icons
HREF_ICONS["/admin/servers/resource-charts"] = coloredIcon(Gauge, colorForHref("/admin/servers/resource-charts"));
HREF_ICONS["/admin/servers/load-balancer"] = coloredIcon(ArrowRightLeft, colorForHref("/admin/servers/load-balancer"));
HREF_ICONS["/admin/epg/calendar"] = coloredIcon(Calendar, colorForHref("/admin/epg/calendar"));
HREF_ICONS["/admin/tickets"] = coloredIcon(Send, colorForHref("/admin/tickets"));
HREF_ICONS["/admin/tickets/new"] = coloredIcon(Plus, colorForHref("/admin/tickets/new"));
HREF_ICONS["/admin/analytics"] = coloredIcon(BarChart3, colorForHref("/admin/analytics"));
HREF_ICONS["/admin/analytics/bandwidth"] = coloredIcon(BarChart3, colorForHref("/admin/analytics/bandwidth"));
HREF_ICONS["/admin/analytics/viewer-heatmap"] = coloredIcon(Globe, colorForHref("/admin/analytics/viewer-heatmap"));
HREF_ICONS["/admin/analytics/pdf"] = coloredIcon(Download, colorForHref("/admin/analytics/pdf"));
HREF_ICONS["/admin/settings/catchup"] = coloredIcon(Play, colorForHref("/admin/settings/catchup"));
HREF_ICONS["/admin/settings/white-label"] = coloredIcon(Sparkles, colorForHref("/admin/settings/white-label"));
HREF_ICONS["/admin/settings/server-guard"] = coloredIcon(Shield, colorForHref("/admin/settings/server-guard"));
HREF_ICONS["/admin/settings/performance-core"] = coloredIcon(Gauge, colorForHref("/admin/settings/performance-core"));
HREF_ICONS["/admin/settings/auto-fix"] = coloredIcon(Wrench, colorForHref("/admin/settings/auto-fix"));
HREF_ICONS["/admin/settings/lb-redirect"] = coloredIcon(Lock, colorForHref("/admin/settings/lb-redirect"));
HREF_ICONS["/admin/settings/cloud-backup"] = coloredIcon(Cloud, colorForHref("/admin/settings/cloud-backup"));
HREF_ICONS["/admin/settings/server-cleaner"] = coloredIcon(Trash2, colorForHref("/admin/settings/server-cleaner"));
HREF_ICONS["/admin/settings/vod-proxy"] = coloredIcon(EyeOff, colorForHref("/admin/settings/vod-proxy"));
HREF_ICONS["/admin/settings/apps-lock"] = coloredIcon(Lock, colorForHref("/admin/settings/apps-lock"));
HREF_ICONS["/admin/settings/stream-analyzer"] = coloredIcon(Activity, colorForHref("/admin/settings/stream-analyzer"));
HREF_ICONS["/admin/settings/source-swap"] = coloredIcon(ArrowRightLeft, colorForHref("/admin/settings/source-swap"));
HREF_ICONS["/admin/settings/source-monitor"] = coloredIcon(Radio, colorForHref("/admin/settings/source-monitor"));
HREF_ICONS["/admin/settings/prefix-manager"] = coloredIcon(Paintbrush, colorForHref("/admin/settings/prefix-manager"));
HREF_ICONS["/admin/settings/batch-manager"] = coloredIcon(Package, colorForHref("/admin/settings/batch-manager"));
HREF_ICONS["/admin/settings/expiry-videos"] = coloredIcon(Film, colorForHref("/admin/settings/expiry-videos"));
HREF_ICONS["/admin/settings/disk-monitor"] = coloredIcon(HardDrive, colorForHref("/admin/settings/disk-monitor"));
HREF_ICONS["/admin/app-builder"] = coloredIcon(Layers, colorForHref("/admin/app-builder"));

export function navIconForHref(href: string): ReactNode {
  if (HREF_ICONS[href]) return HREF_ICONS[href];
  if (href.includes("/content/")) return coloredIcon(FolderOpen, colorForHref(href));
  if (href.includes("/mass-delete")) return coloredIcon(Trash2, "#f87171");
  if (href.includes("/settings/")) return coloredIcon(Settings, colorForHref(href));
  return coloredIcon(List, colorForHref(href));
}

const SETTINGS_ICON_MAP: Record<string, { Icon: LucideIcon; color: string }> = {
  "/admin/settings/general": { Icon: Settings, color: "#38bdf8" },
  "/admin/settings/community": { Icon: MessageSquare, color: "#22d3ee" },
  "/admin/settings/streams": { Icon: Play, color: "#f97316" },
  "/admin/settings/binaries": { Icon: Download, color: "#4ade80" },
  "/admin/settings/cache": { Icon: Database, color: "#2dd4bf" },
  "/admin/settings/backup": { Icon: Database, color: "#34d399" },
  "/admin/settings/tmdb": { Icon: Film, color: "#c084fc" },
  "/admin/settings/notifications": { Icon: Bell, color: "#fbbf24" },
  "/admin/settings/server": { Icon: Server, color: "#60a5fa" },
  "/admin/settings/updates": { Icon: RefreshCw, color: "#22d3ee" },
  "/admin/settings/domains": { Icon: Globe, color: "#818cf8" },
  "/admin/settings/security": { Icon: Shield, color: "#f87171" },
  "/admin/settings/fingerprint": { Icon: Sparkles, color: "#e879f9" },
  "/admin/settings/geo": { Icon: Globe, color: "#06b6d4" },
  "/admin/settings/player": { Icon: Video, color: "#f472b6" },
  "/admin/profile": { Icon: User, color: "#a78bfa" },
  "/admin/settings/catchup": { Icon: Play, color: "#f97316" },
  "/admin/settings/white-label": { Icon: Sparkles, color: "#e879f9" },
  "/admin/settings/server-guard": { Icon: Shield, color: "#f87171" },
  "/admin/settings/performance-core": { Icon: Gauge, color: "#4ade80" },
  "/admin/settings/auto-fix": { Icon: Wrench, color: "#f59e0b" },
  "/admin/settings/lb-redirect": { Icon: Lock, color: "#818cf8" },
  "/admin/settings/cloud-backup": { Icon: Cloud, color: "#38bdf8" },
  "/admin/settings/server-cleaner": { Icon: Trash2, color: "#94a3b8" },
  "/admin/settings/vod-proxy": { Icon: EyeOff, color: "#c084fc" },
  "/admin/settings/apps-lock": { Icon: Lock, color: "#fbbf24" },
  "/admin/settings/stream-analyzer": { Icon: Activity, color: "#22d3ee" },
  "/admin/settings/source-swap": { Icon: ArrowRightLeft, color: "#2dd4bf" },
  "/admin/settings/source-monitor": { Icon: Radio, color: "#fb923c" },
  "/admin/settings/prefix-manager": { Icon: Paintbrush, color: "#f472b6" },
  "/admin/settings/batch-manager": { Icon: Package, color: "#34d399" },
  "/admin/settings/expiry-videos": { Icon: Film, color: "#ec4899" },
  "/admin/settings/disk-monitor": { Icon: HardDrive, color: "#a855f7" },
  "/admin/settings/device-binding": { Icon: Smartphone, color: "#22d3ee" },
  "/admin/settings/stream-fingerprint": { Icon: Fingerprint, color: "#e879f9" },
  "/admin/settings/same-ip-detection": { Icon: Shield, color: "#f87171" },
  "/admin/settings/lb-sessions": { Icon: Server, color: "#60a5fa" },
  "/admin/settings/mass-edit": { Icon: ListChecks, color: "#f59e0b" },
  "/admin/settings/migration": { Icon: ArrowRightLeft, color: "#34d399" },
};

/** Colored icon for a settings sidebar link. */
export function settingsNavIcon(href: string): ReactNode {
  const entry = SETTINGS_ICON_MAP[href];
  if (entry) return coloredIcon(entry.Icon, entry.color, ICON_SIZE);
  return HREF_ICONS[href] ?? coloredIcon(Settings, "#7dd3fc", ICON_SIZE);
}

export function coloredGroupIcon(groupId: string): ReactNode {
  const map: Record<string, { Icon: LucideIcon; color: string }> = {
    subscriptions: { Icon: ShoppingCart, color: "#60a5fa" },
    "streaming-servers": { Icon: Layers, color: "#4ade80" },
    proxies: { Icon: Network, color: "#2dd4bf" },
    rtmp: { Icon: MessageSquare, color: "#14b8a6" },
    live: { Icon: Play, color: "#f97316" },
    epg: { Icon: Tv, color: "#c084fc" },
    vods: { Icon: Video, color: "#ec4899" },
    bouquets: { Icon: Flower2, color: "#fbbf24" },
    users: { Icon: Users, color: "#818cf8" },
    packages: { Icon: Package, color: "#34d399" },
    statistics: { Icon: BarChart3, color: "#38bdf8" },
    analytics: { Icon: BarChart3, color: "#818cf8" },
    security: { Icon: Lock, color: "#f87171" },
    logs: { Icon: List, color: "#fca5a5" },
    "streaming-tools": { Icon: Wrench, color: "#f59e0b" },
    tickets: { Icon: Send, color: "#fcd34d" },
    settings: { Icon: Settings, color: "#94a3b8" },
    license: { Icon: KeyRound, color: "#a855f7" },
    addons: { Icon: Puzzle, color: "#e879f9" },
    "app-builder": { Icon: Layers, color: "#4ade80" },
    integrations: { Icon: Sparkles, color: "#d946ef" },
    updates: { Icon: RefreshCw, color: "#22d3ee" },
    ai: { Icon: Sparkles, color: "#a78bfa" },
  };
  const entry = map[groupId];
  if (entry) return coloredIcon(entry.Icon, entry.color, GROUP_ICON_SIZE);
  return coloredIcon(List, "#7dd3fc", GROUP_ICON_SIZE);
}

export function withNavItemIcons<T extends { href: string; label: string; section?: string; icon?: ReactNode }>(
  items: T[]
): (T & { icon: ReactNode })[] {
  return items.map((item) => ({
    ...item,
    icon: item.icon ?? navIconForHref(item.href),
  }));
}
