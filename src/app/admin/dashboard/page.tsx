"use client";

import { PanelDashboard } from "@/components/panel-dashboard";
import { RealtimeDashboard } from "@/components/realtime-dashboard";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <RealtimeDashboard />
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

