"use client";

import { PanelDashboard } from "@/components/panel-dashboard";
import { OpsStatusGlance } from "@/components/ops-status-glance";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <OpsStatusGlance />
      <PanelDashboard
        statsUrl="/api/admin/stats"
        widgetsUrl="/api/admin/dashboard-widgets"
        linesHref="/admin/lines"
        streamsHref="/admin/streams"
        connectionsHref="/admin/connections"
        serversHref="/admin/servers"
        addServerHref="/admin/servers/add"
        showActivity
      />
    </div>
  );
}

