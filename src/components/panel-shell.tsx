"use client";

import { useState } from "react";
import { PanelTopNav } from "@/components/panel-top-nav";
import { AdminPanelSidebar, PanelSidebar, ResellerPanelSidebar } from "@/components/panel-sidebar";
import { PanelLiveChat } from "@/components/panel-live-chat";
import { ResellerNotificationsWidget } from "@/components/reseller-notifications-widget";
import { PanelCommunityBar } from "@/components/panel-community-bar";
import { PanelUpdateBanner } from "@/components/panel-update-banner";
import { PanelUpdateProgress } from "@/components/panel-update-progress";
import { PanelReleaseNotesModal } from "@/components/panel-release-notes-modal";
import { PanelDemoBanner } from "@/components/panel-demo-banner";
import ChatAssistant from "@/components/chat-assistant";
import { withSidebarItemIcons } from "@/lib/panel-nav-bridge";
import { getResellerSidebarNav } from "@/lib/reseller-sidebar-nav";
import { getAdminSidebarNav } from "@/lib/admin-sidebar-nav";
import type { ResellerWhiteLabel } from "@/lib/reseller-white-label";

export function PanelShell({
  title,
  role,
  username,
  isDemo = false,
  whiteLabel = null,
  children,
}: {
  title: string;
  role: "ADMIN" | "RESELLER";
  username?: string;
  isDemo?: boolean;
  whiteLabel?: ResellerWhiteLabel | null;
  children: React.ReactNode;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const resellerSidebar =
    role === "RESELLER" ? withSidebarItemIcons(getResellerSidebarNav()) : null;
  const adminEntries = role === "ADMIN" ? withSidebarItemIcons(getAdminSidebarNav()) : null;
  const dashboardHref = role === "ADMIN" ? "/admin/dashboard" : "/reseller/dashboard";
  const accent = whiteLabel?.accentColor;
  const brandLogo = whiteLabel?.logoUrl;

  return (
    <div className="panel-shell" style={accent ? ({ ["--accent" as string]: accent } as React.CSSProperties) : undefined}>
      <div className="panel-shell-inner">
        <div className="panel-sidebar-column hidden lg:block shrink-0">
          {role === "ADMIN" ? (
            <AdminPanelSidebar brand={title} brandHref={dashboardHref} />
          ) : (
            <ResellerPanelSidebar brand={title} brandHref={dashboardHref} />
          )}
        </div>

        {mobileNav && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[240] bg-black/60 backdrop-blur-sm lg:hidden cursor-pointer"
              aria-label="Close menu"
              onClick={() => setMobileNav(false)}
            />
            <div className="fixed inset-y-0 left-0 z-[250] lg:hidden shadow-2xl">
              {role === "ADMIN" && adminEntries ? (
                <PanelSidebar
                  entries={adminEntries}
                  className="h-full"
                  brand={title}
                  brandHref={dashboardHref}
                  showReport
                  onNavigate={() => setMobileNav(false)}
                />
              ) : (
                resellerSidebar && (
                  <PanelSidebar
                    entries={resellerSidebar}
                    className="h-full"
                    brand={title}
                    brandHref={dashboardHref}
                    showReport
                    onNavigate={() => setMobileNav(false)}
                  />
                )
              )}
            </div>
          </>
        )}

        <div className="panel-main-surface">
          <div className="panel-main-bg-pattern" aria-hidden />
          <PanelTopNav
            brand={title}
            brandHref={dashboardHref}
            brandLogoUrl={brandLogo || undefined}
            role={role}
            links={[]}
            menus={[]}
            showMenuBar={false}
            username={username}
            onMenuToggle={() => setMobileNav((o) => !o)}
          />
          <main className="panel-main-content flex-1 p-4 md:p-6 pb-24 overflow-auto min-w-0 flex flex-col">
            {isDemo && <PanelDemoBanner />}
            {role === "ADMIN" && <PanelUpdateBanner />}
            <div className="flex-1">{children}</div>
            <PanelCommunityBar />
          </main>
          {username && <PanelLiveChat username={username} />}
          {role === "RESELLER" && <ResellerNotificationsWidget />}
          {role === "ADMIN" && <PanelUpdateProgress />}
          {role === "ADMIN" && <PanelReleaseNotesModal />}
          <ChatAssistant />
        </div>
      </div>
    </div>
  );
}
