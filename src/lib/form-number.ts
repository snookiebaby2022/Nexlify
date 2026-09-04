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

/** Line max connections. 0 = unlimited simultaneous streams. */
export function coerceLineMaxConnections(
  value: number | "" | null | undefined,
  fallback = 1
): number {
  if (value === "" || value == null) return fallback;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function formatLineMaxConnections(n: number): string {
  return n <= 0 ? "∞" : String(n);
}
