"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV } from "@/lib/settings-nav";
import { settingsNavIcon } from "@/lib/nav-item-icons";
import { SettingsProfileHeader } from "@/components/settings-profile-header";
import { SettingsCommunityLinks } from "@/components/settings-community-links";
import { PanelSidebarVersion } from "@/components/panel-sidebar-version";

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-0 min-h-[calc(100vh-8rem)] panel-settings-layout">
      <SettingsProfileHeader />
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <aside
        className="panel-settings-aside shrink-0 w-full lg:w-56 rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="px-4 py-3 text-sm font-semibold border-b"
          style={{ borderColor: "var(--border)", background: "rgba(94,184,232,0.12)", color: "var(--accent)" }}
        >
          Settings
        </div>
        <nav className="panel-settings-nav p-2 space-y-0.5 max-h-[40vh] lg:max-h-[70vh] overflow-y-auto overflow-x-auto">
          {SETTINGS_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="panel-settings-nav-link flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors whitespace-nowrap"
                style={{
                  background: active ? "rgba(94,184,232,0.2)" : "transparent",
                  color: active ? "#fff" : "var(--muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {settingsNavIcon(item.href)}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden lg:block">
          <SettingsCommunityLinks />
          <PanelSidebarVersion variant="settings" />
        </div>
      </aside>
      <div className="flex-1 min-w-0 panel-settings-main">{children}</div>
      </div>
    </div>
  );
}
