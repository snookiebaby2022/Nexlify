import { prisma } from "@/lib/prisma";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import { parseLogAutoClearHours } from "@/lib/log-page";

export {
  DEFAULT_LOG_AUTO_CLEAR_HOURS,
  DEFAULT_LOG_PAGE_SIZE,
  LOG_AUTO_CLEAR_OPTIONS,
  LOG_PAGE_SIZE_OPTIONS,
  parseLogAutoClearHours,
  parseLogLimit,
} from "@/lib/log-page";

export async function getLogAutoClearHours(): Promise<number> {
  const general = await getSettingGroup("general");
  return parseLogAutoClearHours(general.logAutoClearHours);
}

export async function setLogAutoClearHours(hours: number): Promise<number> {
  const next = parseLogAutoClearHours(hours);
  await setSettingGroup("general", { logAutoClearHours: next });
  return next;
}

export type LogPurgeResult = {
  skipped: boolean;
  hours: number;
  activity: number;
  cron: number;
  leak: number;
  imports: number;
};

export async function purgeExpiredLogs(): Promise<LogPurgeResult> {
  const hours = await getLogAutoClearHours();
  if (hours <= 0) {
    return { skipped: true, hours: 0, activity: 0, cron: 0, leak: 0, imports: 0 };
  }
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [activity, cron, leak, imports] = await Promise.all([
    prisma.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.cronRunLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.leakAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.importJob.deleteMany({
      where: { createdAt: { lt: cutoff }, status: { not: "running" } },
    }),
  ]);
  return {
    skipped: false,
    hours,
    activity: activity.count,
    cron: cron.count,
    leak: leak.count,
    imports: imports.count,
  };
}
