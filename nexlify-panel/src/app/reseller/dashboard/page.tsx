"use client";



import { PanelDashboard } from "@/components/panel-dashboard";



export default function ResellerDashboardPage() {

  return (

    <PanelDashboard

      statsUrl="/api/reseller/stats"

      linesHref="/reseller/lines"

      streamsHref="/reseller/streams"

      serversHref="/reseller/dashboard"

      addServerHref=""

      showActivity={false}

    />

  );

}

