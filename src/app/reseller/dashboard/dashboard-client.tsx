"use client";

import { PanelDashboard } from "@/components/panel-dashboard";

type ResellerStats = Awaited<
  ReturnType<typeof import("@/lib/reseller-dashboard-stats").loadResellerDashboardStats>
>;

export function ResellerDashboardClient({ initialStats }: { initialStats: ResellerStats }) {
  return (
    <PanelDashboard
      variant="reseller"
      statsUrl="/api/reseller/stats"
      widgetsUrl="/api/reseller/dashboard-widgets"
      linesHref="/reseller/lines"
      streamsHref="/reseller/streams"
      connectionsHref="/reseller/live_connections"
      serversHref="/reseller/dashboard"
      addServerHref=""
      showActivity
      initialStats={initialStats}
    />
  );
}
