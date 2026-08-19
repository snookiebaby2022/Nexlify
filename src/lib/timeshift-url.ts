/** Xtream/XUI catch-up URL: /timeshift/user/pass/{duration}/{start}/{id}.ts */

export function parseTimeshiftStart(start: string): Date | null {
  const raw = decodeURIComponent(start).trim();
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length > 10 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // YYYY-MM-DD:HH-MM or YYYY-MM-DD:HH:MM
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[:\s](\d{2})[-:](\d{2})/);
  if (!m) return null;
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Map a live Xtream source to the provider timeshift container on the same host.
 * `http://host/live/u/p/123.ts` → `http://host/timeshift/u/p/{duration}/{start}/123.ts`
 */
export function xtreamTimeshiftSourceUrl(
  liveUrl: string,
  durationMinutes: number,
  start: string
): string | null {
  try {
    const u = new URL(liveUrl.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const duration = Math.max(1, Math.min(durationMinutes || 1, 24 * 60));
    const startSeg = /^[0-9A-Za-z:_-]+$/.test(start) ? start : encodeURIComponent(start.replace(/\\/g, ""));
    const path = u.pathname.replace(/\/+$/, "");
    const live = path.match(/^(.*)\/live\/([^/]+)\/([^/]+)\/([^/]+?)(\.ts)?$/i);
    if (live) {
      const ext = live[5] || ".ts";
      u.pathname = `${live[1]}/timeshift/${live[2]}/${live[3]}/${duration}/${startSeg}/${live[4]}${ext}`;
      return u.toString();
    }
    const xt = path.match(/^(.*)\/([^/]+)\/([^/]+)\/(\d+)(\.ts)?$/i);
    if (xt) {
      const ext = xt[5] || ".ts";
      u.pathname = `${xt[1]}/timeshift/${xt[2]}/${xt[3]}/${duration}/${startSeg}/${xt[4]}${ext}`;
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}
