import type { SidebarNavEntry } from "@/lib/admin-sidebar-nav";
import { LayoutDashboard, Wifi } from "lucide-react";
import { coloredGroupIcon, coloredIcon } from "@/lib/nav-item-icons";

/** XUI-style reseller / sub-reseller sidebar (matches admin layout). */
export function getResellerSidebarNav(): SidebarNavEntry[] {
  return [
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
          { href: "/reseller/lines/add", label: "Add Line", section: "Lines" },
          { href: "/reseller/lines/add?package=1", label: "Add Line (with Package)", section: "Lines" },
          { href: "/reseller/lines", label: "Manage Lines", section: "Lines" },
          { href: "/reseller/lines/mass-edit", label: "Mass Edit Lines", section: "Lines" },
          { href: "/reseller/line_activity", label: "Line Activity", section: "Lines" },
          { href: "/reseller/mags/add", label: "Add MAG Device", section: "Devices" },
          { href: "/reseller/mags", label: "Manage MAG Devices", section: "Devices" },
          { href: "/reseller/enigmas/add", label: "Add Enigma Device", section: "Enigma" },
          { href: "/reseller/enigmas", label: "Manage Enigma Devices", section: "Enigma" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "epg",
        label: "EPG",
        icon: coloredGroupIcon("epg"),
        items: [{ href: "/reseller/epg_view", label: "EPG preview" }],
      },
    },
    {
      kind: "group",
      group: {
        id: "sub-resellers",
        label: "My sub-users",
        icon: coloredGroupIcon("users"),
        items: [
          { href: "/reseller/users/add", label: "Add User", section: "Users" },
          { href: "/reseller/users", label: "Manage Users", section: "Users" },
          { href: "/reseller/users/sub", label: "Sub-Resellers" },
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
        items: [
          { href: "/reseller/profile", label: "Edit profile" },
          { href: "/reseller/credits", label: "My credits" },
        ],
      },
    },
    {
      kind: "group",
      group: {
        id: "support",
        label: "Support",
        icon: coloredGroupIcon("tickets"),
        items: [
          { href: "/reseller/tickets", label: "All tickets" },
          { href: "/reseller/tickets/new", label: "Create ticket" },
        ],
      },
    },
  ];
}
