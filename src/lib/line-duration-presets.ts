import { creditCostForDays } from "@/lib/package-credits";

export type LineDurationPreset = {
  id: string;
  label: string;
  days: number;
  isTrial: boolean;
  creditCost: number;
};

export const LINE_DURATION_PRESETS: LineDurationPreset[] = [
  { id: "trial-24h", label: "24hr trial", days: 1, isTrial: true, creditCost: 0 },
  { id: "1-month", label: "1 month", days: 30, isTrial: false, creditCost: creditCostForDays(30) },
  { id: "3-months", label: "3 months", days: 90, isTrial: false, creditCost: creditCostForDays(90) },
  { id: "6-months", label: "6 months", days: 180, isTrial: false, creditCost: creditCostForDays(180) },
  { id: "12-months", label: "12 months", days: 365, isTrial: false, creditCost: creditCostForDays(365) },
];
