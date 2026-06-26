import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";

/** Match a single cron field (minute, hour, etc.) against a value. */
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
  return (
    fieldMatches(minute, date.getUTCMinutes(), 0, 59) &&
    fieldMatches(hour, date.getUTCHours(), 0, 23) &&
    fieldMatches(dom, date.getUTCDate(), 1, 31) &&
    fieldMatches(month, date.getUTCMonth() + 1, 1, 12) &&
    fieldMatches(dow, date.getUTCDay(), 0, 6)
  );
}

const BACKUP_LAST_RUN_KEY = "backup_last_run";

export async function shouldRunScheduledBackup(): Promise<boolean> {
  const backup = await getSettingGroup("backup");
  if (!backup.enabled) return false;

  const expr = String(backup.scheduleCron || "0 3 * * *").trim();
  if (!cronMatchesNow(expr)) return false;

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
