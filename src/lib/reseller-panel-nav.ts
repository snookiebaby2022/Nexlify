export function getResellerPanelNav(): { label: string; href: string; icon?: string }[] {
  return [
    { label: "Dashboard", href: "/reseller", icon: "home" },
    { label: "Lines", href: "/reseller/lines", icon: "users" },
    { label: "Settings", href: "/reseller/settings", icon: "settings" },
  ];
}
