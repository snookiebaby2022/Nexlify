"use client";

import { useState, Suspense, useEffect } from "react";
import { PanelTopNav } from "@/components/panel-top-nav";
import { DashboardLiveMetricsProvider } from "@/components/dashboard-live-metrics";
import { AdminPanelSidebar, PanelSidebar, ResellerPanelSidebar } from "@/components/panel-sidebar";
import { ResellerNotificationsWidget } from "@/components/reseller-notifications-widget";
import { PanelCommunityBar } from "@/components/panel-community-bar";
import { PanelUpdateBanner } from "@/components/panel-update-banner";
import { PanelUpdateProgress } from "@/components/panel-update-progress";
import { PanelUpdateJobProvider } from "@/contexts/panel-update-job-context";
import { PanelReleaseNotesModal } from "@/components/panel-release-notes-modal";
import { PanelDemoBanner } from "@/components/panel-demo-banner";
import { withSidebarItemIcons } from "@/lib/panel-nav-bridge";
import { getResellerSidebarNav } from "@/lib/reseller-sidebar-nav";
import { getAdminSidebarNav } from "@/lib/admin-sidebar-nav";
import { PanelMobileBottomNav } from "@/components/panel-mobile-bottom-nav";
import type { ResellerWhiteLabel } from "@/lib/reseller-white-label";
import {
  DEFAULT_RESELLER_GROUP_FLAGS,
  type ResellerGroupFlags,
} from "@/lib/reseller-group-flags";
import { ResellerGroupFlagsProvider } from "@/components/reseller-group-flags-context";

export function PanelShell({
  title,
  role,
  username,
  isDemo = false,
  whiteLabel = null,
  resellerFlags = DEFAULT_RESELLER_GROUP_FLAGS,
  children,
}: {
  title: string;
  role: "ADMIN" | "RESELLER";
  username?: string;
  isDemo?: boolean;
  whiteLabel?: ResellerWhiteLabel | null;
  resellerFlags?: ResellerGroupFlags;
  children: React.ReactNode;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    if (!mobileNav) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNav]);
  const resellerSidebar =
    role === "RESELLER" ? withSidebarItemIcons(getResellerSidebarNav(resellerFlags)) : null;
  const adminEntries = role === "ADMIN" ? withSidebarItemIcons(getAdminSidebarNav()) : null;
  const dashboardHref = role === "ADMIN" ? "/admin/dashboard" : "/reseller/dashboard";
  const accent = whiteLabel?.accentColor;
  const brandLogo = whiteLabel?.logoUrl;

  return (
    <ResellerGroupFlagsProvider flags={role === "RESELLER" ? resellerFlags : DEFAULT_RESELLER_GROUP_FLAGS}>
    <PanelUpdateJobProvider>
    <DashboardLiveMetricsProvider enabled={role === "ADMIN"}>
    <div
      className={`panel-shell${mobileNav ? " panel-shell--mobile-nav-open" : ""}`}
      style={accent ? ({ ["--accent" as string]: accent } as React.CSSProperties) : undefined}
    >
      {mobileNav && (
        <>
          <button
            type="button"
            className="panel-mobile-drawer-backdrop fixed inset-0 z-[500] md:hidden cursor-pointer"
            aria-label="Close menu"
            onClick={() => setMobileNav(false)}
          />
          <div
            className="panel-mobile-drawer fixed inset-y-0 left-0 z-[510] flex w-[min(100vw,320px)] flex-col overflow-hidden md:hidden panel-mobile-drawer--open"
          >
            {role === "ADMIN" && adminEntries ? (
              <Suspense fallback={<aside className="panel-sidebar !w-full h-full min-h-[100dvh]" aria-hidden />}>
                <PanelSidebar
                  entries={adminEntries}
                  className="!w-full h-full min-h-[100dvh]"
                  brand={title}
                  brandHref={dashboardHref}
                  showReport
                  username={username}
                  onNavigate={() => setMobileNav(false)}
                />
              </Suspense>
            ) : (
              resellerSidebar && (
                <Suspense fallback={<aside className="panel-sidebar !w-full h-full min-h-[100dvh]" aria-hidden />}>
                  <PanelSidebar
                    entries={resellerSidebar}
                    className="!w-full h-full min-h-[100dvh]"
                    brand={title}
                    brandHref={dashboardHref}
                    showReport
                    username={username}
                    onNavigate={() => setMobileNav(false)}
                  />
                </Suspense>
              )
            )}
          </div>
        </>
      )}

      <div className="panel-shell-inner">
        <div className="panel-sidebar-column hidden md:block shrink-0">
          {role === "ADMIN" ? (
            <AdminPanelSidebar brand={title} brandHref={dashboardHref} username={username} />
          ) : (
            <ResellerPanelSidebar
              brand={title}
              brandHref={dashboardHref}
              username={username}
              flags={resellerFlags}
            />
          )}
        </div>

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
            menuOpen={mobileNav}
          />
          <main className="panel-main-content flex-1 p-3 sm:p-4 md:p-6 pb-28 md:pb-24 overflow-x-hidden md:overflow-x-auto overflow-y-auto min-w-0 flex flex-col">
            {isDemo && <PanelDemoBanner />}
          {role === "ADMIN" && <PanelUpdateBanner />}
          {role === "ADMIN" && <PanelUpdateProgress />}
          <div className="flex-1">{children}</div>
            <PanelCommunityBar />
          </main>
          {role === "RESELLER" && <ResellerNotificationsWidget />}
          {role === "ADMIN" && <PanelReleaseNotesModal />}
        </div>
      </div>
      <PanelMobileBottomNav role={role} onMore={() => setMobileNav(true)} />
    </div>
    </DashboardLiveMetricsProvider>
    </PanelUpdateJobProvider>
    </ResellerGroupFlagsProvider>
  );
}
