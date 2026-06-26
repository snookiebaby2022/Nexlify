import type { ReactNode } from "react";
import type { TopNavMenu } from "@/components/panel-top-nav";
import type { SidebarNavEntry, SidebarNavGroup, SidebarNavLink } from "@/lib/admin-sidebar-nav";
import { navIconForHref } from "@/lib/nav-item-icons";

/** Convert sidebar nav entries to horizontal top-bar links + dropdown menus. */
export function sidebarNavToTopNav(entries: SidebarNavEntry[]): {
  links: { href: string; label: string; icon: React.ReactNode }[];
  menus: TopNavMenu[];
} {
  const links = entries
    .filter((e): e is Extract<SidebarNavEntry, { kind: "link" }> => e.kind === "link")
    .map((e) => ({
      href: e.link.href,
      label: e.link.label,
      icon: e.link.icon,
    }));

  const menus: TopNavMenu[] = entries
    .filter((e): e is Extract<SidebarNavEntry, { kind: "group" }> => e.kind === "group")
    .map((e) => ({
      id: e.group.id,
      label: e.group.label,
      icon: e.group.icon,
      items: e.group.items.map((i) => ({
        href: i.href,
        label: i.label,
        section: i.section,
        icon: i.icon ?? navIconForHref(i.href),
      })),
    }));

  return { links, menus };
}

/** Convert top-nav links + menus into left sidebar entries (reseller). */
export function topNavToSidebarEntries(nav: {
  links: { href: string; label: string; icon: ReactNode }[];
  menus: TopNavMenu[];
}): SidebarNavEntry[] {
  const entries: SidebarNavEntry[] = nav.links.map((link) => ({
    kind: "link" as const,
    link: link as SidebarNavLink,
  }));
  for (const menu of nav.menus) {
    const group: SidebarNavGroup = {
      id: menu.id,
      label: menu.label,
      icon: menu.icon,
      items: menu.items.map((i) => ({
        href: i.href,
        label: i.label,
        section: i.section,
        icon: i.icon ?? navIconForHref(i.href),
      })),
    };
    entries.push({ kind: "group", group });
  }
  return entries;
}

/** Attach icons to sidebar sub-items when missing. */
export function withSidebarItemIcons(entries: SidebarNavEntry[]): SidebarNavEntry[] {
  return entries.map((entry) => {
    if (entry.kind !== "group") return entry;
    return {
      kind: "group" as const,
      group: {
        ...entry.group,
        items: entry.group.items.map((item) => ({
          ...item,
          icon: item.icon ?? navIconForHref(item.href),
        })),
      },
    };
  });
}
