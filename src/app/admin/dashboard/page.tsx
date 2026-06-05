"use client";



import { PanelDashboard } from "@/components/panel-dashboard";



export default function AdminDashboardPage() {

  return (

    <PanelDashboard

      statsUrl="/api/admin/stats"

      linesHref="/admin/lines"

      streamsHref="/admin/streams"

      connectionsHref="/admin/connections"

      serversHref="/admin/servers"

      addServerHref="/admin/servers/add"

      showActivity

    />

  );

}

