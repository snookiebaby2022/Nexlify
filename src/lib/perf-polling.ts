import { getSettingGroup } from "@/lib/panel-settings";

export type AdminPollIntervals = {
  dashboardMs: number;
  connectionsMs: number;
  streamsMs: number;
  dashboardSseMs: number;
};

const DEFAULT: AdminPollIntervals = {
  dashboardMs: 15_000,
  connectionsMs: 5_000,
  streamsMs: 15_000,
  dashboardSseMs: 3_000,
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
