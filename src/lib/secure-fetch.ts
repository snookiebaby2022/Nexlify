import { fetchWithRetry, type FetchRetryOptions } from "@/lib/fetch-retry";

export class InsecureUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsecureUrlError";
  }
}

/** Only http: and https: are allowed for outbound panel requests. */
export function parseHttpOrHttpsUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InsecureUrlError("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InsecureUrlError(`Blocked protocol: ${parsed.protocol}`);
  }
  return parsed;
}

/** Prefer HTTPS when the same host supports it (upgrade http → https). */
export function preferHttpsUrl(url: string): string {
  const parsed = parseHttpOrHttpsUrl(url);
  if (parsed.protocol === "http:" && process.env.PANEL_ALLOW_HTTP_FETCH !== "1") {
    parsed.protocol = "https:";
  }
  return parsed.toString();
}

export async function secureFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(preferHttpsUrl(url), init);
}

export async function secureFetchWithRetry(
  url: string,
  init?: FetchRetryOptions
): Promise<Response> {
  return fetchWithRetry(preferHttpsUrl(url), init);
}

/** IPv4 / IPv6 literal safe for geo lookup query strings. */
export function sanitizeIpLiteral(ip: string): string | null {
  const v = String(ip ?? "").trim();
  if (!v) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) {
    const parts = v.split(".").map(Number);
    if (parts.some((n) => n > 255)) return null;
    return v;
  }
  if (/^[0-9a-fA-F:]+$/.test(v) && v.includes(":")) return v;
  return null;
}
