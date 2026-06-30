export const LICENSE_TERMS = {
  "1m": { days: 30, label: "1 month", tier: "1m" },
  "3m": { days: 90, label: "3 months", tier: "3m" },
  "6m": { days: 180, label: "6 months", tier: "6m" },
  "1y": { days: 365, label: "1 year", tier: "1y" },
  unlimited: { days: 36500, label: "Unlimited", tier: "unlimited" },
} as const;

export type LicenseTermId = keyof typeof LICENSE_TERMS;

export function licenseTermLabel(term: string | undefined): string | undefined {
  if (!term) return undefined;
  const t = term.toLowerCase() as LicenseTermId;
  return LICENSE_TERMS[t]?.label ?? term;
}
