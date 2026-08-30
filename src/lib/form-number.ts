/** Allow clearing a min-N number input so "1" can be replaced with "2". */
export function parseIntAllowEmpty(raw: string): number | "" {
  if (raw.trim() === "") return "";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : "";
}

export function coerceMinInt(value: number | "" | null | undefined, min = 1): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : min;
}
