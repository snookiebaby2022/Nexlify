"use client";



import { PanelDashboard } from "@/components/panel-dashboard";



export default function AdminDashboardPage() {

  return (

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

  );

}

