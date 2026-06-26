/** Host is IPv4 or bracketed IPv6 — not a customer domain. */
export function isIpHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "::1") return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.startsWith("[") && h.includes("]")) return true;
  return false;
}

function assumeProxySsl(): boolean {
  return (
    process.env.PANEL_ASSUME_PROXY_SSL !== "0" &&
    process.env.PANEL_ASSUME_PROXY_SSL !== "false"
  );
}

/** Origin as seen by IPTV clients (respects reverse-proxy headers). */
export function publicOriginFromRequest(
  reqUrl: string,
  headers?: { get(name: string): string | null }
): string {
  const url = new URL(reqUrl);
  let hostRaw =
    headers?.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers?.get("host")?.trim() ||
    url.host;
  const hostOnly = hostRaw.split(":")[0];
  const fwdPort = headers?.get("x-forwarded-port")?.split(",")[0]?.trim();
  if (fwdPort && !hostRaw.includes(":")) {
    if (fwdPort !== "443" && fwdPort !== "80") hostRaw = `${hostOnly}:${fwdPort}`;
  }
  let proto =
    headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  if (proto === "https" && hostRaw.endsWith(":3000")) {
    hostRaw = hostOnly;
  }
  if (proto === "http" && hostRaw.endsWith(":80")) {
    hostRaw = hostOnly;
  }
  if (
    proto === "http" &&
    assumeProxySsl() &&
    (headers?.get("x-forwarded-for") ||
      headers?.get("x-real-ip") ||
      headers?.get("x-forwarded-host"))
  ) {
    proto = "https";
  }
  return `${proto}://${hostRaw}`;
}

function normalizeOrigin(input: string): string | null {
  const t = input.trim().replace(/\/+$/, "");
  if (!t) return null;
  try {
    const u = t.includes("://") ? new URL(t) : new URL(`https://${t}`);
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Prefer the live request origin when env/settings still point at an IP or another host
 * (e.g. IPTV on https://nexlify.live:3000 while NEXT_PUBLIC_SERVER_URL is http://VPS:3000).
 */
export function pickPublicOrigin(requestOrigin: string, configuredOrigin?: string): string {
  const fromReq = normalizeOrigin(requestOrigin);
  if (!fromReq) return normalizeOrigin(configuredOrigin ?? "") ?? requestOrigin.replace(/\/+$/, "");

  const env = normalizeOrigin(configuredOrigin ?? "");
  if (!env) return fromReq;

  try {
    const req = new URL(fromReq);
    const cfg = new URL(env);
    const reqHost = req.hostname.toLowerCase();
    const cfgHost = cfg.hostname.toLowerCase();

    if (reqHost === cfgHost) {
      if (req.protocol === "https:" && cfg.protocol === "http:") return fromReq;
      return fromReq;
    }

    if (!isIpHost(reqHost) && isIpHost(cfgHost)) return fromReq;
    if (!isIpHost(reqHost) && req.protocol === "https:" && cfg.protocol === "http:") return fromReq;

    const primary = process.env.PANEL_PRIMARY_DOMAIN?.trim().toLowerCase();
    if (primary && reqHost === primary) return fromReq;
  } catch {
    return env;
  }

  return env;
}
