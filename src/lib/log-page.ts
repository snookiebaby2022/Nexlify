export const DEFAULT_LOG_PAGE_SIZE = 50;
export const LOG_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const;

/** Hours until log rows are deleted by cron. 0 = never. Default 72 matches the previous 3-day cleanup. */
export const LOG_AUTO_CLEAR_OPTIONS = [
  { hours: 24, label: "Every 24 hours" },
  { hours: 72, label: "Every 3 days" },
  { hours: 168, label: "Every 7 days" },
  { hours: 720, label: "Every 30 days" },
  { hours: 2160, label: "Every 90 days" },
  { hours: 0, label: "Never" },
] as const;

export const DEFAULT_LOG_AUTO_CLEAR_HOURS = 72;

const ALLOWED_HOURS = new Set<number>(LOG_AUTO_CLEAR_OPTIONS.map((o) => o.hours));

export function parseLogLimit(raw: string | null | undefined, fallback = DEFAULT_LOG_PAGE_SIZE): number {
  const n = parseInt(raw ?? String(fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(500, Math.max(10, n));
}

export function parseLogAutoClearHours(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !ALLOWED_HOURS.has(n)) return DEFAULT_LOG_AUTO_CLEAR_HOURS;
  return n;
}
