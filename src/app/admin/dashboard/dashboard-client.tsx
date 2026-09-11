"use client";

import { PanelDashboard } from "@/components/panel-dashboard";
import { LazyDashboardSection } from "@/components/lazy-dashboard-section";
import { OpsStatusGlance } from "@/components/ops-status-glance";

type InitialStats = Awaited<ReturnType<typeof import("@/lib/dashboard-stats").loadHeaderStats>> | null;

export function AdminDashboardClient({ initialStats = null }: { initialStats?: InitialStats }) {
  return (
    <div className="space-y-6">
      <LazyDashboardSection minHeight="2.5rem">
        <OpsStatusGlance />
      </LazyDashboardSection>
      <PanelDashboard
        statsUrl="/api/admin/stats"
        widgetsUrl="/api/admin/dashboard-widgets"
        linesHref="/admin/lines"
        streamsHref="/admin/streams"
        connectionsHref="/admin/connections"
        serversHref="/admin/servers"
        addServerHref="/admin/servers/add"
        showActivity
        initialStats={initialStats}
      />
    </div>
  );
}
