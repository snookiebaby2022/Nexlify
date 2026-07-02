import { resolveStreamEdgeHttpPort } from "./server-ports";

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

function behindNginx(): boolean {
  return (
    process.env.PANEL_BEHIND_NGINX === "1" ||
    process.env.PANEL_BEHIND_NGINX === "true"
  );
}

function publicPortSuffix(proto: string): string {
  let pub = Number(
    process.env.PANEL_PUBLIC_PORT || (proto === "https" ? 443 : 80)
  );
  if (!Number.isFinite(pub) || pub <= 0) {
    pub = proto === "https" ? 443 : 80;
  }
  // Never expose Node upstream ports in browser-facing URLs.
  if (isInternalUpstreamPort(String(pub))) {
    pub = proto === "https" ? 443 : 80;
  }
  if (proto === "http" && pub === 80) return "";
  if (proto === "https" && pub === 443) return "";
  return `:${pub}`;
}

/** Node upstream ports — never show these in browser-facing panel URLs. */
function isInternalUpstreamPort(port: string): boolean {
  const n = Number(port);
  return n === 3000 || n === 3001 || n === 13000 || n === 13001;
}

/**
 * Browser-visible origin for panel redirects behind nginx.
 * Never exposes the internal Node upstream port (e.g. :3000).
 */
export function panelRedirectOriginFromRequest(
  reqUrl: string,
  headers?: { get(name: string): string | null }
): string {
  const url = new URL(reqUrl);
  const hostOnly = (
    headers?.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers?.get("host")?.trim() ||
    url.host
  ).split(":")[0];

  let proto =
    headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");

  const fwdPort = headers?.get("x-forwarded-port")?.split(",")[0]?.trim();
  if (fwdPort && isInternalUpstreamPort(fwdPort)) {
    // Next.js sets x-forwarded-port to the upstream Node port behind nginx.
  } else if (fwdPort && fwdPort !== "80" && fwdPort !== "443" && !hostOnly.includes(":")) {
    return `${proto}://${hostOnly}:${fwdPort}`;
  }

  if (isIpHost(hostOnly)) {
    proto = "http";
  } else if (
    proto === "http" &&
    assumeProxySsl() &&
    (headers?.get("x-forwarded-for") ||
      headers?.get("x-real-ip") ||
      headers?.get("x-forwarded-host"))
  ) {
    proto = "https";
  }

  return `${proto}://${hostOnly}${publicPortSuffix(proto)}`
    .replace(/:3000(?=\/|$)/, "")
    .replace(/:3001(?=\/|$)/, "")
    .replace(/:13000(?=\/|$)/, "")
    .replace(/:13001(?=\/|$)/, "");
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
  const streamEdgePort = resolveStreamEdgeHttpPort();
  if (fwdPort && Number(fwdPort) === streamEdgePort) {
    return `http://${hostOnly}:${streamEdgePort}`;
  }
  if (fwdPort && !hostRaw.includes(":") && !behindNginx() && !isInternalUpstreamPort(fwdPort)) {
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
  // Dedicated stream edge (:8080) stays HTTP — do not upgrade to HTTPS for playlist URLs.
  if (proto === "http" && fwdPort && fwdPort !== "80" && fwdPort !== "443" && !behindNginx()) {
    return `http://${hostRaw.includes(":") ? hostRaw : `${hostOnly}:${fwdPort}`}`;
  }
  if (
    proto === "http" &&
    assumeProxySsl() &&
    !isIpHost(hostOnly) &&
    (headers?.get("x-forwarded-for") ||
      headers?.get("x-real-ip") ||
      headers?.get("x-forwarded-host"))
  ) {
    proto = "https";
  }
  if (behindNginx()) {
    hostRaw = `${hostOnly}${publicPortSuffix(proto)}`;
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
