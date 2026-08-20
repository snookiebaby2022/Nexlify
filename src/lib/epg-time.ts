/** Panel EPG / Xtream clock formatting (timezone + 12h/24h). */

export type PanelTimeFormat = "12" | "24";

export type EpgDisplayOptions = {
  timezone?: string;
  timeFormat?: PanelTimeFormat | string | null;
};

export function normalizeTimeFormat(value: unknown): PanelTimeFormat {
  const v = String(value ?? "24").trim().toLowerCase();
  if (v === "12" || v === "12h" || v === "am/pm" || v === "ampm") return "12";
  return "24";
}

function partsMap(d: Date, timeZone: string, hour12: boolean) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12,
    hourCycle: hour12 ? "h12" : "h23",
  });
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

/** Xtream-style `YYYY-MM-DD HH:mm:ss` in panel timezone (what IPTV apps expect for `start`/`end`). */
export function formatXtreamEpgDateTime(d: Date, opts: EpgDisplayOptions = {}): string {
  const timeZone = opts.timezone || "Europe/London";
  const hour12 = normalizeTimeFormat(opts.timeFormat) === "12";
  const p = partsMap(d, timeZone, hour12);
  if (hour12) {
    const h = parseInt(p.hour || "0", 10);
    const suffix = (p.dayPeriod || "").toUpperCase();
    const h12 = h === 0 ? 12 : h;
    return `${p.year}-${p.month}-${p.day} ${String(h12).padStart(2, "0")}:${p.minute}:${p.second}${suffix ? ` ${suffix}` : ""}`;
  }
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Compact time range for overlays, e.g. `22:30 - 23:00` or `10:30 PM - 11:00 PM`. */
export function formatEpgTimeRange(start: Date, end: Date, opts: EpgDisplayOptions = {}): string {
  const timeZone = opts.timezone || "Europe/London";
  const hour12 = normalizeTimeFormat(opts.timeFormat) === "12";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12,
    hourCycle: hour12 ? "h12" : "h23",
  });
  return `${fmt.format(start)} - ${fmt.format(end)}`;
}

/** Human-readable date + time for admin/reseller EPG tables. */
export function formatEpgDateTimeLabel(iso: string | Date, opts: EpgDisplayOptions = {}): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const timeZone = opts.timezone || "Europe/London";
  const hour12 = normalizeTimeFormat(opts.timeFormat) === "12";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12,
    hourCycle: hour12 ? "h12" : "h23",
  });
  return fmt.format(d);
}

/** Live clock string for server_info / panel header. */
export function formatPanelClock(now: Date, opts: EpgDisplayOptions = {}): string {
  return formatXtreamEpgDateTime(now, opts);
}

function xmltvOffsetToken(d: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
  const tz = fmt.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!m) return "+0000";
  const sign = m[1];
  const hh = String(parseInt(m[2]!, 10)).padStart(2, "0");
  const mm = String(parseInt(m[3] || "0", 10)).padStart(2, "0");
  return `${sign}${hh}${mm}`;
}

/** XMLTV programme timestamp in channel/panel timezone with offset suffix. */
export function formatXmltvDateInTimezone(d: Date, timeZone: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const p = partsMap(d, timeZone, false);
  return (
    `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second} ${xmltvOffsetToken(d, timeZone)}`
  );
}

export function decodeXtreamBase64(value: string): string {
  if (!value) return "";
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").toString("utf8");
    }
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(value), (c: string) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
  } catch {
    return value;
  }
}
