/** Sanitise Xtream catalog strings so XCIPTV's JSON/XML parsers do not crash. */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function xtreamSafeText(value: unknown): string {
  return String(value ?? "")
    .replace(CONTROL, "")
    .replace(/\uFFFD/g, "")
    .trim();
}

export function xtreamUnix(date: Date | string | number | null | undefined): number {
  const ms =
    date instanceof Date
      ? date.getTime()
      : typeof date === "number"
        ? date
        : typeof date === "string"
          ? Date.parse(date)
          : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

export function xtreamUnixString(date: Date | string | number | null | undefined): string {
  return String(xtreamUnix(date));
}

/** XCIPTV iterates JSON arrays. Delta/timestamp must still return an array, never a wrapper object. */
export function xtreamDeltaArray<T>(
  payload: T[],
  clientTimestamp: number | null | undefined,
  updatedAt: (item: T) => number
): T[] {
  if (!clientTimestamp || !Number.isFinite(clientTimestamp) || clientTimestamp <= 0) {
    return payload;
  }
  return payload.filter((item) => updatedAt(item) > clientTimestamp);
}

export function xtreamOutputFormats(raw: string | null | undefined): string[] {
  const parts = String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s === "hls" ? "m3u8" : s));
  const out = [...new Set(parts)].filter((s) => s === "m3u8" || s === "ts" || s === "rtmp");
  return out.length ? out : ["m3u8", "ts"];
}

export function xtreamCategoryIds(numericId: string): number[] {
  const n = Number(numericId);
  return Number.isFinite(n) ? [n] : [0];
}

export function xmltvSafeText(value: unknown): string {
  return xtreamSafeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function xtreamBase64(value: unknown): string {
  return Buffer.from(xtreamSafeText(value), "utf8").toString("base64");
}
