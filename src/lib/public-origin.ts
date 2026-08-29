import { resolveStreamEdgeHttpPort } from "./server-ports";

/** Bracket bare IPv6 addresses for origin URL host segments. */
export function formatHostForOrigin(hostname: string): string {
  const h = hostname.trim();
  if (!h) return h;
  if (h.startsWith("[") && h.endsWith("]")) return h;
  if (h.includes(":") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return `[${h}]`;
  return h;
}

/** Host is IPv4 or bracketed IPv6 — not a customer domain. */
export function isIpHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "::1") return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.startsWith("[") && h.includes("]")) return true;
  return false;
}

/**
 * IPTV apps (XCIPTV etc.) often paste `http://host` / `https://host:port` into the DNS field.
 * That value can arrive as the HTTP Host header, which breaks `host.split(":")[0]` → `"http"`.
 */
export function parseRequestHostHeader(raw: string): {
  hostname: string;
  port: string;
  schemeHint: "" | "http" | "https";
} {
  let t = (raw ?? "").trim();
  if (!t) return { hostname: "", port: "", schemeHint: "" };

  let schemeHint: "" | "http" | "https" = "";
  if (/^https:\/\//i.test(t)) schemeHint = "https";
  else if (/^http:\/\//i.test(t)) schemeHint = "http";

  t = t.replace(/^https?:\/\//i, "");
  // Drop path/query/fragment if a full URL was stuffed into Host
  t = t.split("/")[0]?.split("?")[0]?.split("#")[0] ?? t;
  t = t.trim();

  // Bracketed IPv6: [2001:db8::1]:8443
  if (t.startsWith("[")) {
    const m = t.match(/^\[([^\]]+)](?::(\d{1,5}))?$/i);
    if (m) {
      return {
        hostname: m[1].toLowerCase(),
        port: m[2] ?? "",
        schemeHint,
      };
    }
  }

  // hostname:port or ipv4:port (last colon + digits only)
  const colon = t.lastIndexOf(":");
  if (colon > 0 && /^\d{1,5}$/.test(t.slice(colon + 1))) {
    return {
      hostname: t.slice(0, colon).toLowerCase(),
      port: t.slice(colon + 1),
      schemeHint,
    };
  }

  return { hostname: t.toLowerCase(), port: "", schemeHint };
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
  // Standard ports omit the suffix. Never emit https://host:80 (PANEL_PUBLIC_PORT=80
  // while forceHttps upgrades the scheme — that produced panel.nexlify.live:80).
  if (proto === "http" && pub === 80) return "";
  if (proto === "https" && (pub === 443 || pub === 80)) return "";
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
  const parsed = parseRequestHostHeader(
    headers?.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      headers?.get("host")?.trim() ||
      url.host
  );
  const hostOnly = parsed.hostname || url.hostname;

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
    // IP installs: browser panel stays on http unless TLS was actually terminated
    if (proto !== "https") proto = "http";
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
  const hostHeader =
    headers?.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers?.get("host")?.trim() ||
    url.host;
  const parsed = parseRequestHostHeader(hostHeader);
  const hostOnly = formatHostForOrigin(parsed.hostname || url.hostname);
  const hostPort = parsed.port || (url.port && !isInternalUpstreamPort(url.port) ? url.port : "");
  const fwdPort =
    headers?.get("x-nexlify-client-port")?.split(",")[0]?.trim() ||
    headers?.get("x-forwarded-port")?.split(",")[0]?.trim();
  const streamEdgePort = resolveStreamEdgeHttpPort();

  // Prefer explicit non-internal listen port (any extra IPTV port: 8080, 25461, …)
  const clientPort =
    fwdPort && !isInternalUpstreamPort(fwdPort)
      ? fwdPort
      : hostPort && !isInternalUpstreamPort(hostPort)
        ? hostPort
        : "";

  let proto =
    headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  // Scheme pasted into DNS is only a hint when the proxy did not set proto
  if (!headers?.get("x-forwarded-proto") && parsed.schemeHint && proto === "http") {
    // Keep actual socket protocol from reqUrl; do not upgrade to https from Host alone
    // (that would point apps at :443 when they dialed :80). Hostname sanitizing is enough.
  }

  if (clientPort && Number(clientPort) === streamEdgePort) {
    return `http://${hostOnly}:${streamEdgePort}`;
  }

  // Extra IPTV ports must stay on the port the app connected to (XCIPTV follows server_info.port).
  // Allow https on IP when TLS was actually terminated (x-forwarded-proto=https).
  if (clientPort && clientPort !== "80" && clientPort !== "443" && !isInternalUpstreamPort(clientPort)) {
    const p = proto === "https" ? "https" : "http";
    return `${p}://${hostOnly}:${clientPort}`;
  }

  let hostRaw = hostOnly;
  if (proto === "https" && clientPort === "443") {
    hostRaw = hostOnly;
  } else if (proto === "http" && (clientPort === "80" || !clientPort)) {
    hostRaw = hostOnly;
  } else if (clientPort && clientPort !== "80" && clientPort !== "443") {
    hostRaw = `${hostOnly}:${clientPort}`;
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
  if (behindNginx() && (!clientPort || clientPort === "80" || clientPort === "443")) {
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

    // Health checks / local curls must not publish 127.0.0.1 in server_info for IPTV apps.
    if (
      (reqHost === "127.0.0.1" || reqHost === "localhost" || reqHost === "::1") &&
      cfgHost &&
      cfgHost !== reqHost
    ) {
      return env;
    }
    const reqPort = req.port || (req.protocol === "https:" ? "443" : "80");

    // IPTV apps on extra ports (8080, 25461, …) must keep that port in server_info / M3U URLs.
    if (reqPort !== "80" && reqPort !== "443") {
      const host = formatHostForOrigin(
        reqHost === "127.0.0.1" || reqHost === "localhost" || reqHost === "::1"
          ? cfgHost
          : reqHost
      );
      return `${req.protocol}//${host}:${reqPort}`;
    }

    if (reqHost === cfgHost) {
      if (req.protocol === "https:" && cfg.protocol === "http:") return fromReq;
      return fromReq;
    }

    if (isIpHost(reqHost) && !isIpHost(cfgHost)) return fromReq;
    if (!isIpHost(reqHost) && isIpHost(cfgHost)) return fromReq;
    // Prefer the host the IPTV client actually dialed (IP or domain), so XCIPTV
    // server_info.url matches login DNS and reseller custom domains work.
    if (isIpHost(reqHost) && isIpHost(cfgHost) && reqHost !== cfgHost) return fromReq;
    if (!isIpHost(reqHost) && !isIpHost(cfgHost) && reqHost !== cfgHost) return fromReq;
    if (!isIpHost(reqHost) && req.protocol === "https:" && cfg.protocol === "http:") return fromReq;

    const primary = process.env.PANEL_PRIMARY_DOMAIN?.trim().toLowerCase();
    if (primary && reqHost === primary) return fromReq;
    const extras = (process.env.PANEL_EXTRA_DOMAINS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (extras.includes(reqHost)) return fromReq;
  } catch {
    return env;
  }

  return fromReq;
}
