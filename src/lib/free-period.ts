/** Free launch period: all licenses are free until 2026-08-01 00:00:00 UTC */
export const FREE_PERIOD_END = new Date("2026-08-01T00:00:00Z");

export function isFreePeriod(): boolean {
  return new Date() < FREE_PERIOD_END;
}

export function daysUntilFreePeriodEnds(): number {
  const now = new Date();
  if (now >= FREE_PERIOD_END) return 0;
  return Math.ceil((FREE_PERIOD_END.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
