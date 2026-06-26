import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Box,
  Clapperboard,
  Cloud,
  CreditCard,
  Database,
  Download,
  Film,
  Flower2,
  FolderOpen,
  Gauge,
  Globe,
  KeyRound,
  MessageSquare,
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
  UserPlus,
  Users,
  Video,
  Wifi,
  Wrench,
  Zap,
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
  if (href.includes("/settings") || href.includes("/profile")) return "#94a3b8";
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
    ["/admin/enigmas", Box],
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

export function navIconForHref(href: string): ReactNode {
  if (HREF_ICONS[href]) return HREF_ICONS[href];
  if (href.includes("/content/")) return coloredIcon(FolderOpen, colorForHref(href));
  if (href.includes("/mass-delete")) return coloredIcon(Trash2, "#f87171");
  if (href.includes("/settings/")) return coloredIcon(Settings, colorForHref(href));
  return coloredIcon(List, colorForHref(href));
}

/** Colored icon for a settings sidebar link. */
export function settingsNavIcon(href: string): ReactNode {
  return HREF_ICONS[href] ?? coloredIcon(Settings, colorForHref(href), ICON_SIZE);
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
    security: { Icon: Lock, color: "#f87171" },
    logs: { Icon: List, color: "#fca5a5" },
    "streaming-tools": { Icon: Wrench, color: "#f59e0b" },
    tickets: { Icon: Send, color: "#fcd34d" },
    settings: { Icon: Settings, color: "#94a3b8" },
    license: { Icon: KeyRound, color: "#a855f7" },
    addons: { Icon: Puzzle, color: "#e879f9" },
    integrations: { Icon: Sparkles, color: "#d946ef" },
    updates: { Icon: RefreshCw, color: "#22d3ee" },
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
