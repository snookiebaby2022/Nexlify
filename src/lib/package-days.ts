/**
 * Normalize package duration (days) from XUI-style imports where months
 * were often stored as small integers (1/3/6/12) instead of 30/90/180/365.
 */
export function inferPackageDaysFromName(name: string, rawDays?: number): number | null {
  const n = String(name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!n) return null;

  if (/\b24\s*h(our)?s?\b|\b1\s*day\b|\btrial\b/.test(n) && !/\bmonth/.test(n)) return 1;
  if (/\b48\s*h(our)?s?\b|\b2\s*days?\b/.test(n) && !/\bmonth/.test(n)) return 2;
  if (/\b1\s*week\b|\b7\s*days?\b/.test(n)) return 7;
  if (/\b24\s*months?\b|\b2\s*years?\b/.test(n)) return 730;
  if (/\b12\s*months?\b|\b1\s*year\b|\b12\s*month\b/.test(n)) return 365;
  if (/\b6\s*months?\b/.test(n)) return 180;
  if (/\b3\s*months?\b/.test(n)) return 90;
  if (/\b1\s*months?\b|\b1\s*month\b/.test(n)) return 30;

  const d = Number(rawDays);
  if (!Number.isFinite(d) || d <= 0) return null;

  // Classic XUI: duration stored as months (1–24) for monthly packages.
  if (d <= 24 && !/\bhour|\bday|\bweek|\btrial\b/.test(n)) {
    if (d === 12) return 365;
    if (d === 24) return 730;
    return d * 30;
  }
  return Math.round(d);
}

/** Sort key: trial/short first → 12 months (and beyond). */
export function packageDurationSortKey(days: number, name?: string): number {
  const inferred = inferPackageDaysFromName(name ?? "", days) ?? days;
  if (inferred <= 0) return 99999;
  return inferred;
}
