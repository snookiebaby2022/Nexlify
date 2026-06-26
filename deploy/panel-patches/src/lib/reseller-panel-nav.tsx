import {
  LayoutDashboard,
  Monitor,
  Send,
  Settings,
  Tv,
  UserPlus,
  Wifi,
} from "lucide-react";
import type { TopNavMenu } from "@/components/panel-top-nav";
import { coloredIcon } from "@/lib/nav-item-icons";
import { withNavItemIcons } from "@/lib/nav-item-icons";

/** Reseller sidebar / navigation (XUI-style). */
export function getResellerPanelNav(): {
  links: { href: string; label: string; icon: React.ReactNode }[];
  menus: TopNavMenu[];
} {
  return {
    links: [
      {
        href: "/reseller/dashboard",
        label: "Dashboard",
        icon: coloredIcon(LayoutDashboard, "#38bdf8", 16),
      },
      {
        href: "/reseller/lines",
        label: "Lines",
        icon: coloredIcon(Monitor, "#60a5fa", 16),
      },
    ],
    menus: [
      {
        id: "reseller-lines",
        label: "Subscriptions",
        icon: coloredIcon(Wifi, "#22d3ee", 16),
        items: withNavItemIcons([
          { href: "/reseller/lines/add", label: "Add Line", section: "Lines" },
          { href: "/reseller/lines", label: "Manage Lines", section: "Lines" },
          { href: "/reseller/line_activity", label: "Line Activity", section: "Lines" },
          { href: "/reseller/live_connections", label: "Live Connections", section: "Lines" },
          { href: "/reseller/mags/add", label: "Add MAG Device", section: "Devices" },
          { href: "/reseller/mags", label: "Manage MAG Devices", section: "Devices" },
          { href: "/reseller/enigmas/add", label: "Add Enigma Device", section: "Enigma" },
          { href: "/reseller/enigmas", label: "Manage Enigma Devices", section: "Enigma" },
        ]),
      },
      {
        id: "reseller-epg",
        label: "EPG",
        icon: coloredIcon(Tv, "#c084fc", 16),
        items: withNavItemIcons([{ href: "/reseller/epg_view", label: "EPG preview" }]),
      },
      {
        id: "reseller-subresellers",
        label: "Sub-resellers",
        icon: coloredIcon(UserPlus, "#818cf8", 16),
        items: withNavItemIcons([
          { href: "/reseller/users", label: "Sub-reseller users" },
        ]),
      },
      {
        id: "reseller-account",
        label: "Account",
        icon: coloredIcon(Settings, "#94a3b8", 16),
        items: withNavItemIcons([{ href: "/reseller/profile", label: "Edit profile" }]),
      },
      {
        id: "reseller-support",
        label: "Support",
        icon: coloredIcon(Send, "#fcd34d", 16),
        items: withNavItemIcons([
          { href: "/reseller/tickets", label: "All tickets" },
          { href: "/reseller/tickets/new", label: "Create ticket" },
        ]),
      },
    ],
  };
}
