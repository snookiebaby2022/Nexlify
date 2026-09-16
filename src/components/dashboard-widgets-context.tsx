"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { DashboardWidgetsPayload } from "@/lib/dashboard-widgets";
import { resolveClientPollIntervals, startVisibleInterval } from "@/lib/perf-polling";

const DASHBOARD_POLLS = resolveClientPollIntervals();

type DashboardWidgetsContextValue = {
  data: DashboardWidgetsPayload | null;
  loading: boolean;
  refresh: () => void;
};

const DashboardWidgetsContext = createContext<DashboardWidgetsContextValue | null>(null);

export { DashboardWidgetsContext };

/** One fetch for all dashboard widget slices (avoids 4× parallel /dashboard-widgets). */
export function DashboardWidgetsProvider({
  widgetsUrl,
  children,
}: {
  widgetsUrl: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<DashboardWidgetsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const lightUrl = widgetsUrl.includes("?")
      ? `${widgetsUrl}&light=1`
      : `${widgetsUrl}?light=1`;

    // Paint expiring-lines immediately from the light endpoint, then hydrate full payload.
    setLoading(true);
    fetch(lightUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((light) => {
        if (!light) return;
        setData((prev) => ({
          ...(prev ?? ({} as DashboardWidgetsPayload)),
          ...light,
        }));
        setLoading(false);
      })
      .catch(() => {});

    fetch(widgetsUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => setData(payload))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [widgetsUrl]);

  useEffect(() => {
    refresh();
    return startVisibleInterval(refresh, DASHBOARD_POLLS.dashboardMs);
  }, [refresh]);

  return (
    <DashboardWidgetsContext.Provider value={{ data, loading, refresh }}>
      {children}
    </DashboardWidgetsContext.Provider>
  );
}

export function useDashboardWidgets(): DashboardWidgetsContextValue {
  const ctx = useContext(DashboardWidgetsContext);
  if (!ctx) {
    return {
      data: null,
      loading: false,
      refresh: () => undefined,
    };
  }
  return ctx;
}
