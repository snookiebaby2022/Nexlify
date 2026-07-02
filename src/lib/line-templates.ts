import { creditCostForDays } from "@/lib/package-credits";

export type LineTemplate = {
  id: string;
  label: string;
  description: string;
  days: number;
  maxConnections: number;
  creditCost: number;
  isTrial: boolean;
  lockToIp: boolean;
  allowedCountries: string;
  blockedCountries: string;
  canWatchAdult: boolean;
};

/** One-click line presets for common reseller workflows. */
export const LINE_TEMPLATES: LineTemplate[] = [
  {
    id: "trial-24h-1conn",
    label: "24h trial · 1 conn",
    description: "Short trial, single connection",
    days: 1,
    maxConnections: 1,
    creditCost: 0,
    isTrial: true,
    lockToIp: false,
    allowedCountries: "",
    blockedCountries: "",
    canWatchAdult: false,
  },
  {
    id: "uk-1conn-1mo",
    label: "UK only · 1 conn · 1 month",
    description: "GB-locked standard line",
    days: 30,
    maxConnections: 1,
    creditCost: creditCostForDays(30),
    isTrial: false,
    lockToIp: false,
    allowedCountries: "GB",
    blockedCountries: "",
    canWatchAdult: true,
  },
  {
    id: "full-3conn-1mo",
    label: "Full · 3 conn · 1 month",
    description: "Standard full bouquet, 3 devices",
    days: 30,
    maxConnections: 3,
    creditCost: creditCostForDays(30),
    isTrial: false,
    lockToIp: false,
    allowedCountries: "",
    blockedCountries: "",
    canWatchAdult: true,
  },
  {
    id: "full-5conn-3mo",
    label: "Full · 5 conn · 3 months",
    description: "Premium multi-device package",
    days: 90,
    maxConnections: 5,
    creditCost: creditCostForDays(90),
    isTrial: false,
    lockToIp: false,
    allowedCountries: "",
    blockedCountries: "",
    canWatchAdult: true,
  },
  {
    id: "sports-no-adult-1mo",
    label: "Sports (no adult) · 1 conn",
    description: "Adult content blocked",
    days: 30,
    maxConnections: 1,
    creditCost: creditCostForDays(30),
    isTrial: false,
    lockToIp: false,
    allowedCountries: "",
    blockedCountries: "",
    canWatchAdult: false,
  },
];

export function getLineTemplate(id: string): LineTemplate | undefined {
  return LINE_TEMPLATES.find((t) => t.id === id);
}
