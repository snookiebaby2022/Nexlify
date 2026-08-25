import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";

/** Match a single cron field (minute, hour, etc.) against a value. */
/** Use the server's local clock so "0 3 * * *" is 03:00 on the VPS, not UTC. */
function cronDateParts(date: Date) {
  return {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dom: date.getDate(),
    month: date.getMonth() + 1,
    dow: date.getDay(),
  };
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  const f = field.trim();
  if (f === "*") return true;
  if (f.includes(",")) {
    return f.split(",").some((part) => fieldMatches(part.trim(), value, min, max));
  }
  if (f.includes("/")) {
    const [base, stepStr] = f.split("/");
    const step = parseInt(stepStr, 10);
    if (!step || step < 1) return false;
    const start = base === "*" ? min : parseInt(base, 10);
    if (Number.isNaN(start)) return false;
    for (let i = start; i <= max; i += step) {
      if (i === value) return true;
    }
    return false;
  }
  const n = parseInt(f, 10);
  return !Number.isNaN(n) && n === value;
}

/** Five-field cron: minute hour day-of-month month day-of-week */
export function cronMatchesNow(expression: string, date = new Date()): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  const p = cronDateParts(date);
  return (
    fieldMatches(minute, p.minute, 0, 59) &&
    fieldMatches(hour, p.hour, 0, 23) &&
    fieldMatches(dom, p.dom, 1, 31) &&
    fieldMatches(month, p.month, 1, 12) &&
    fieldMatches(dow, p.dow, 0, 6)
  );
}

/**
 * Hourly cron workers rarely run at minute 0. Match hour/day/month/dow only
 * so a daily "0 4 * * *" dump still runs during the 04:00 UTC hourly tick.
 */
export function cronMatchesThisHour(expression: string, date = new Date()): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [, hour, dom, month, dow] = parts;
  const p = cronDateParts(date);
  return (
    fieldMatches(hour, p.hour, 0, 23) &&
    fieldMatches(dom, p.dom, 1, 31) &&
    fieldMatches(month, p.month, 1, 12) &&
    fieldMatches(dow, p.dow, 0, 6)
  );
}

const BACKUP_LAST_RUN_KEY = "backup_last_run";
const DB_BACKUP_LAST_RUN_KEY = "db_backup_last_run";

export async function shouldRunScheduledBackup(): Promise<boolean> {
  const backup = await getSettingGroup("backup");
  if (!backup.enabled) return false;

  const expr = String(backup.scheduleCron || "0 3 * * *").trim();
  // Hourly worker may tick at :00–:59 of the target hour — match hour/day, not exact minute.
  if (!cronMatchesThisHour(expr)) return false;

  const last = await prisma.panelSetting.findUnique({ where: { key: BACKUP_LAST_RUN_KEY } });
  if (last?.value) {
    const elapsed = Date.now() - new Date(last.value).getTime();
    if (elapsed < 23 * 60 * 60 * 1000) return false;
  }
  return true;
}

export async function markBackupLastRun() {
  const iso = new Date().toISOString();
  await prisma.panelSetting.upsert({
    where: { key: BACKUP_LAST_RUN_KEY },
    create: { key: BACKUP_LAST_RUN_KEY, value: iso },
    update: { value: iso },
  });
}

export async function shouldRunScheduledDbBackup(): Promise<boolean> {
  const backup = await getSettingGroup("backup");
  if (backup.pgDumpCronEnabled === false) return false;

  const expr = String(backup.pgDumpCronSchedule || "0 4 * * *").trim();
  if (!cronMatchesThisHour(expr)) return false;

  const last = await prisma.panelSetting.findUnique({ where: { key: DB_BACKUP_LAST_RUN_KEY } });
  if (last?.value) {
    const elapsed = Date.now() - new Date(last.value).getTime();
    if (elapsed < 23 * 60 * 60 * 1000) return false;
  }
  return true;
}

export async function markDbBackupLastRun() {
  const iso = new Date().toISOString();
  await prisma.panelSetting.upsert({
    where: { key: DB_BACKUP_LAST_RUN_KEY },
    create: { key: DB_BACKUP_LAST_RUN_KEY, value: iso },
    update: { value: iso },
  });
}
