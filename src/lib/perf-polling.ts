import { getSettingGroup } from "@/lib/panel-settings";

export type AdminPollIntervals = {
  dashboardMs: number;
  connectionsMs: number;
  streamsMs: number;
  dashboardSseMs: number;
};

const DEFAULT: AdminPollIntervals = {
  dashboardMs: 30_000,
  connectionsMs: 10_000,
  streamsMs: 30_000,
  dashboardSseMs: 5_000,
};

const PERF: AdminPollIntervals = {
  dashboardMs: 60_000,
  connectionsMs: 15_000,
  streamsMs: 30_000,
  dashboardSseMs: 5_000,
};

/** Server-side poll intervals for admin APIs (SSE, cron-adjacent). */
export async function getServerPollIntervals(): Promise<Pick<AdminPollIntervals, "dashboardSseMs">> {
  const core = await getSettingGroup("performance-core");
  if (core.perfCoreEnabled === false) return { dashboardSseMs: DEFAULT.dashboardSseMs };
  return { dashboardSseMs: PERF.dashboardSseMs };
}

/** Client-side poll intervals — pass from server component or API bootstrap. */
export function resolveClientPollIntervals(perfCoreEnabled?: boolean): AdminPollIntervals {
  if (perfCoreEnabled === false) return DEFAULT;
  return PERF;
}

/** Poll only while the tab is visible so background admin pages don't keep hammering APIs. */
export function startVisibleInterval(tick: () => void, ms: number): () => void {
  let id: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (id == null) return;
    clearInterval(id);
    id = null;
  };
  const start = () => {
    if (id != null) return;
    id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      tick();
    }, ms);
  };
  const onVis = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") {
      stop();
      return;
    }
    tick();
    start();
  };
  start();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVis);
  }
  return () => {
    stop();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVis);
    }
  };
}
