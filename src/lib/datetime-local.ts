/** Format a Date for `<input type="datetime-local">` (local wall clock). */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Expiry = now + days (calendar days via setDate for month packages; fine for 1–2 day trials). */
export function expiryFromDays(days: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  const n = Math.max(0, Math.round(Number(days) || 0));
  d.setDate(d.getDate() + n);
  return d;
}
