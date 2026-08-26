import type { SidebarNavEntry, SidebarNavItem } from "@/lib/admin-sidebar-nav";
import { LayoutDashboard, Wifi } from "lucide-react";
import { coloredGroupIcon, coloredIcon } from "@/lib/nav-item-icons";
import type { ResellerGroupFlags } from "@/lib/reseller-group-flags";
import { DEFAULT_GROUP_NAV } from "@/lib/group-config";

/** XUI-style reseller / sub-reseller sidebar (matches admin layout). */
export function getResellerSidebarNav(opts?: Partial<ResellerGroupFlags>): SidebarNavEntry[] {
  const showStreamingApi = opts?.showStreamingApi !== false;
  const nav = { ...DEFAULT_GROUP_NAV, ...(opts?.nav ?? {}) };
  const accountItems = [
    { href: "/reseller/profile", label: "My Profile" },
    ...(nav.credits ? [{ href: "/reseller/credits", label: "My Credits" }] : []),
    { href: "/reseller/user_logs", label: "Activity Log" },
    ...(showStreamingApi ? [{ href: "/reseller/api", label: "Streaming API" }] : []),
    { href: "/reseller/session", label: "Session" },
  ];

  const entries: SidebarNavEntry[] = [
    {

      kind: "link",

      link: {

        href: "/reseller/dashboard",

        label: "Dashboard",

        icon: coloredIcon(LayoutDashboard, "#38bdf8", 18),

      },

    },

    {

      kind: "link",

      link: {

        href: "/reseller/live_connections",

        label: "Live Connections",

        icon: coloredIcon(Wifi, "#22d3ee", 18),

      },

    },

    {

      kind: "group",

      group: {

        id: "subscriptions",

        label: "Subscriptions",

        icon: coloredGroupIcon("subscriptions"),

        items: [

          { href: "/reseller/lines/add", label: "Add Line", section: "Users" },

          { href: "/reseller/lines", label: "Manage Lines", section: "Users" },

          { href: "/reseller/lines/mass-edit", label: "Mass Edit Lines", section: "Users" },

          { href: "/reseller/bouquets", label: "My Bouquets", section: "Users" },

          { href: "/reseller/line_activity", label: "Line Activity", section: "Users" },

          { href: "/reseller/mags/add", label: "Add MAG Device", section: "MAG Device" },

          { href: "/reseller/mags/bulk", label: "Bulk Add MAG Devices", section: "MAG Device" },

          { href: "/reseller/mags", label: "Manage MAG Devices", section: "MAG Device" },

          { href: "/reseller/mags/convert-to-line", label: "Convert MAG Devices to Line", section: "MAG Device" },

          { href: "/reseller/enigmas/add", label: "Add Enigma2 Device", section: "Enigma2" },

          { href: "/reseller/enigmas", label: "Manage Enigma2 Devices", section: "Enigma2" },

          { href: "/reseller/mag_events", label: "Manage Devices Events", section: "Device Events" },

        ],

      },

    },

    {

      kind: "group",

      group: {

        id: "content",

        label: "Content",

        icon: coloredGroupIcon("live"),

        items: [

          { href: "/reseller/streams", label: "Live Streams" },

          { href: "/reseller/movies", label: "Movies" },

          { href: "/reseller/episodes", label: "Episodes" },

          { href: "/reseller/radios", label: "Radio" },

          { href: "/reseller/epg_view", label: "EPG Preview" },

        ],

      },

    },

    {

      kind: "group",

      group: {

        id: "sub-resellers",

        label: "Sub-resellers",

        icon: coloredGroupIcon("users"),

        items: [

          { href: "/reseller/users/add", label: "Add Sub-Reseller", section: "Users" },

          { href: "/reseller/users", label: "Manage Sub-Resellers", section: "Users" },

          { href: "/reseller/users/credits", label: "Add Credits" },

        ],

      },

    },

    {

      kind: "group",

      group: {

        id: "account",

        label: "Account",

        icon: coloredGroupIcon("settings"),

        items: accountItems,

      },

    },

    {

      kind: "group",

      group: {

        id: "support",

        label: "Support",

        icon: coloredGroupIcon("tickets"),

        items: [

          { href: "/reseller/tickets", label: "All Tickets" },

          { href: "/reseller/tickets/new", label: "Create Ticket" },

          { href: "/reseller/notifications", label: "Notifications" },

        ],

      },

    },

  ];

  return filterResellerNav(entries, nav);
}

function filterResellerNav(entries: SidebarNavEntry[], nav: typeof DEFAULT_GROUP_NAV): SidebarNavEntry[] {
  const dropHref = (href: string) => {
    if (!nav.liveConnections && href.includes("/live_connections")) return true;
    if (!nav.massEdit && href.includes("/mass-edit")) return true;
    if (!nav.devices && (href.includes("/mags") || href.includes("/enigmas") || href.includes("/mag_events"))) {
      return true;
    }
    if (!nav.epg && href.includes("/epg_view")) return true;
    if (!nav.tickets && href.includes("/tickets")) return true;
    return false;
  };

  const out: SidebarNavEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "link") {
      if (!nav.liveConnections && entry.link.href.includes("/live_connections")) continue;
      out.push(entry);
      continue;
    }
    if (entry.group.id === "content" && !nav.content) continue;
    if (entry.group.id === "sub-resellers" && !nav.subResellers) continue;
    if (entry.group.id === "subscriptions" && !nav.lines && !nav.devices) continue;
    const items = entry.group.items.filter((item: SidebarNavItem) => {
      if (!nav.lines && item.href.includes("/lines") && !item.href.includes("/mass-edit")) return false;
      if (!nav.lines && item.href.includes("/bouquets")) return false;
      if (!nav.lines && item.href.includes("/line_activity")) return false;
      return !dropHref(item.href);
    });
    if (!items.length) continue;
    out.push({ kind: "group", group: { ...entry.group, items } });
  }
  return out;
}

