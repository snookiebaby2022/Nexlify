import type { LucideIcon } from "lucide-react";
import { Home, Users, Play, Server, MoreHorizontal, Wifi } from "lucide-react";

export type MobileBottomNavItem = {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  /** Opens the full sidebar drawer instead of navigating. */
  action?: "more";
  match?: (pathname: string) => boolean;
};

const ADMIN_BOTTOM_NAV: MobileBottomNavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/admin/dashboard",
    icon: Home,
    match: (p) => p === "/admin/dashboard" || p === "/admin",
  },
  {
    id: "users",
    label: "Users",
    href: "/admin/lines",
    icon: Users,
    match: (p) => p.startsWith("/admin/lines") || p.startsWith("/admin/users"),
  },
  {
    id: "streams",
    label: "Streams",
    href: "/admin/content/streams",
    icon: Play,
    match: (p) => p.includes("/streams") || p.includes("/content/"),
  },
  {
    id: "servers",
    label: "Servers",
    href: "/admin/servers",
    icon: Server,
    match: (p) => p.startsWith("/admin/servers"),
  },
  { id: "more", label: "More", icon: MoreHorizontal, action: "more" },
];

const RESELLER_BOTTOM_NAV: MobileBottomNavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/reseller/dashboard",
    icon: Home,
    match: (p) => p === "/reseller/dashboard" || p === "/reseller",
  },
  {
    id: "users",
    label: "Users",
    href: "/reseller/lines",
    icon: Users,
    match: (p) => p.startsWith("/reseller/lines") || p.startsWith("/reseller/users"),
  },
  {
    id: "connections",
    label: "Live",
    href: "/reseller/live_connections",
    icon: Wifi,
    match: (p) => p.startsWith("/reseller/live_connections"),
  },
  { id: "more", label: "More", icon: MoreHorizontal, action: "more" },
];

export function getMobileBottomNav(role: "ADMIN" | "RESELLER"): MobileBottomNavItem[] {
  return role === "ADMIN" ? ADMIN_BOTTOM_NAV : RESELLER_BOTTOM_NAV;
}

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/lines": "Manage Lines",
  "/admin/lines/add": "Add Line",
  "/admin/connections": "Live Connections",
  "/admin/servers": "Servers",
  "/admin/content/streams": "Streams",
  "/admin/tickets": "Tickets",
  "/admin/management/packages": "Packages",
  "/reseller/dashboard": "Dashboard",
  "/reseller/lines": "Manage Lines",
  "/reseller/lines/add": "Add Line",
  "/reseller/live_connections": "Live Connections",
  "/reseller/tickets": "Tickets",
};

export function getMobilePageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "Panel";
  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
