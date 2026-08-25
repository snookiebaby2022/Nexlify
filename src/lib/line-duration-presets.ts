import { creditCostForDays } from "@/lib/package-credits";

/** ~10 years — shown as UNLIMITED in Xtream / the lines table (threshold is 8 years). */
export const UNLIMITED_LINE_DAYS = 3650;

export type LineDurationPreset = {
  id: string;
  label: string;
  days: number;
  isTrial: boolean;
  creditCost: number;
};

export const LINE_DURATION_PRESETS: LineDurationPreset[] = [
  { id: "trial-24h", label: "24 Hours", days: 1, isTrial: true, creditCost: 0 },
  { id: "trial-48h", label: "48 Hours", days: 2, isTrial: true, creditCost: 0 },
  { id: "1-week", label: "1 Week", days: 7, isTrial: false, creditCost: 0 },
  { id: "1-month", label: "1 Month", days: 30, isTrial: false, creditCost: creditCostForDays(30) },
  { id: "3-months", label: "3 Months", days: 90, isTrial: false, creditCost: creditCostForDays(90) },
  { id: "6-months", label: "6 Months", days: 180, isTrial: false, creditCost: creditCostForDays(180) },
  { id: "12-months", label: "12 Months", days: 365, isTrial: false, creditCost: creditCostForDays(365) },
  { id: "24-months", label: "24 Months", days: 730, isTrial: false, creditCost: creditCostForDays(730) },
  { id: "unlimited", label: "Unlimited", days: UNLIMITED_LINE_DAYS, isTrial: false, creditCost: 0 },
];
