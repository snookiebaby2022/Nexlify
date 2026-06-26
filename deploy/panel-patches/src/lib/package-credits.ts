/** Standard subscription lengths with XUI-style credit costs (1 mo = 1, 3 mo = 2, …). */
export const STANDARD_PACKAGE_TEMPLATES = [
  { name: "24 Hours", days: 1, creditCost: 0 },
  { name: "48 Hours", days: 2, creditCost: 0 },
  { name: "1 Week", days: 7, creditCost: 0 },
  { name: "1 Month", days: 30, creditCost: 1 },
  { name: "3 Months", days: 90, creditCost: 2 },
  { name: "6 Months", days: 180, creditCost: 3 },
  { name: "12 Months", days: 365, creditCost: 4 },
  { name: "24 Months", days: 730, creditCost: 6 },
] as const;

/** Credit cost from duration in days (falls back to tiered months). */
export function creditCostForDays(days: number): number {
  const exact = STANDARD_PACKAGE_TEMPLATES.find((t) => t.days === days);
  if (exact) return exact.creditCost;

  if (days <= 7) return 0;
  if (days <= 30) return 1;
  if (days <= 90) return 2;
  if (days <= 180) return 3;
  if (days <= 365) return 4;
  return Math.max(4, Math.ceil(days / 365) * 4);
}

export function packageLabelForDays(days: number): string {
  const t = STANDARD_PACKAGE_TEMPLATES.find((x) => x.days === days);
  if (t) return t.name;
  if (days === 1) return "24 Hours";
  if (days < 30) return `${days} Days`;
  if (days === 30) return "1 Month";
  if (days % 30 === 0) return `${days / 30} Months`;
  return `${days} days`;
}
