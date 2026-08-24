"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useDashboardStream, type DashboardStreamData } from "@/hooks/use-dashboard-stream";

type DashboardLiveMetrics = {
  data: DashboardStreamData | null;
  connected: boolean;
};

const DashboardLiveMetricsContext = createContext<DashboardLiveMetrics>({
  data: null,
  connected: false,
});

/** One EventSource for the top bar and dashboard KPI so both show the same live NIC rates. */
export function DashboardLiveMetricsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const value = useDashboardStream(enabled);
  return (
    <DashboardLiveMetricsContext.Provider value={value}>{children}</DashboardLiveMetricsContext.Provider>
  );
}

export function useDashboardLiveMetrics(): DashboardLiveMetrics {
  return useContext(DashboardLiveMetricsContext);
}
