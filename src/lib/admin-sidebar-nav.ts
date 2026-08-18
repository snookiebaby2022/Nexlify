export type SidebarNavEntry = {
  label: string;
  href: string;
  icon?: string;
  children?: SidebarNavEntry[];
};

export type SidebarNavGroup = {
  heading?: string;
  entries: SidebarNavEntry[];
};

export type SidebarNavLink = SidebarNavEntry;

export function getAdminSidebarNav(): SidebarNavGroup[] {
  return [
    {
      entries: [
        { label: "Dashboard", href: "/admin", icon: "home" },
        { label: "Streams", href: "/admin/streams", icon: "tv" },
        { label: "Lines", href: "/admin/lines", icon: "users" },
        { label: "Bouquets", href: "/admin/bouquets", icon: "list" },
        { label: "Settings", href: "/admin/settings", icon: "settings" },
      ],
    },
  ];
}
