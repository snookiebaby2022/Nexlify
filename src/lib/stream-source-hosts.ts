import { normalizeStreamSource } from "@/lib/stream-source";

export const EMPTY_SOURCE_ORIGIN = "(no playable source)";

/** Scheme + host + non-default port, matching XUI Sources grouping. */
export function streamSourceOrigin(raw: string | null | undefined): string {
  const s = normalizeStreamSource(String(raw ?? ""));
  if (!s || s.startsWith("pending://")) return EMPTY_SOURCE_ORIGIN;
  try {
    const u = new URL(s);
    const port = u.port;
    const drop =
      (u.protocol === "http:" && (port === "" || port === "80")) ||
      (u.protocol === "https:" && (port === "" || port === "443"));
    const host = drop ? u.hostname : u.host;
    return `${u.protocol}//${host}`.toLowerCase();
  } catch {
    const m = s.match(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i);
    return m ? m[1].toLowerCase() : EMPTY_SOURCE_ORIGIN;
  }
}

/** Accept a full URL or origin; returns normalized origin or empty. */
export function normalizeSourceOriginInput(raw: string): string {
  const s = normalizeStreamSource(raw.trim());
  if (!s) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return streamSourceOrigin(s);
  if (/^[\w.-]+(:\d+)?$/.test(s)) return streamSourceOrigin(`http://${s}`);
  return "";
}

export function rewriteUrlOrigin(url: string, fromOrigin: string, toOrigin: string): string {
  const from = streamSourceOrigin(fromOrigin);
  const to = streamSourceOrigin(toOrigin);
  if (!from || from === EMPTY_SOURCE_ORIGIN || !to || to === EMPTY_SOURCE_ORIGIN) return url;
  if (streamSourceOrigin(url) !== from) return url;
  const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i, "");
  return `${to}${rest}`;
}
