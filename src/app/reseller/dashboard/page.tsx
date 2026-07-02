"use client";

import { PanelDashboard } from "@/components/panel-dashboard";

export default function ResellerDashboardPage() {
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
      showActivity={true}
    />
  );
}
