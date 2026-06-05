/** @type {Record<string, { days: number; label: string; tier: string }>} */
export const LICENSE_TERMS = {
  "1m": { days: 30, label: "1 month", tier: "1m" },
  "3m": { days: 90, label: "3 months", tier: "3m" },
  "6m": { days: 180, label: "6 months", tier: "6m" },
  "1y": { days: 365, label: "1 year", tier: "1y" },
};

export function resolveLicenseTerm(termRaw) {
  const term = String(termRaw || "1y").toLowerCase().trim();
  const cfg = LICENSE_TERMS[term];
  if (!cfg) {
    throw new Error(
      `Invalid term "${termRaw}". Use: ${Object.keys(LICENSE_TERMS).join(", ")}`
    );
  }
  return { term, ...cfg };
}
