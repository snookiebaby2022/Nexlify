import { isValidPanelDomain, normalizeDomain } from "@/lib/domains-host";
import { formatHostForOrigin, isIpHost } from "@/lib/public-origin";

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

export type StreamServerDomainParse =
  | { ok: true; domain: string | null }
  | { ok: false; error: string };

/**
 * Normalize one media/control hostname for a StreamServer Domain Name field.
 * Rejects comma-separated or multi-host values — each LB gets exactly one
 * direct media hostname (DNS-only A record to that LB).
 */
export function parseStreamServerDomain(raw: unknown): StreamServerDomainParse {
  if (raw === undefined || raw === null) return { ok: true, domain: null };
  const text = String(raw).trim();
  if (!text) return { ok: true, domain: null };

  const authority = text.replace(/^https?:\/\//i, "").split("/")[0] ?? text;
  if (/[,;|]/.test(authority) || /\s/.test(authority)) {
    return {
      ok: false,
      error:
        "Domain Name must be exactly one hostname (e.g. lb2.stream.example.com). Do not enter comma-separated domains.",
    };
  }

  let host = "";
  try {
    const u = new URL(text.includes("://") ? text : `http://${text}`);
    host = u.hostname.toLowerCase();
  } catch {
    host = normalizeDomain(text);
  }

  if (!host) return { ok: true, domain: null };

  if (IPV4_PATTERN.test(host) || (host.startsWith("[") && host.includes("]"))) {
    return { ok: true, domain: host.replace(/^\[|\]$/g, "") };
  }

  if (!isValidPanelDomain(host)) {
    return { ok: false, error: `Invalid Domain Name: ${host}` };
  }

  return { ok: true, domain: normalizeDomain(host) };
}

/** Hostname suitable for a direct media origin, or empty if none. */
export function mediaHostnameFromServerDomain(domain: string | null | undefined): string {
  const parsed = parseStreamServerDomain(domain ?? "");
  if (!parsed.ok || !parsed.domain) return "";
  return parsed.domain;
}

export type DirectMediaServerFields = {
  host: string;
  domain?: string | null;
  protocol?: string | null;
};

/**
 * Prefer a single configured LB domain; fall back to the server IP/host.
 * Never invents a hostname from rotator lists or comma-separated leftovers.
 */
export function directMediaHostnameForServer(server: DirectMediaServerFields): string | null {
  const fromDomain = mediaHostnameFromServerDomain(server.domain);
  if (fromDomain) return fromDomain;
  const host = String(server.host || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .split(":")[0]
    ?.trim();
  return host || null;
}

const dnsMatchCache = new Map<string, { at: number; useDomain: boolean }>();
const DNS_CACHE_MS = 60_000;

/**
 * Use the LB domain only when DNS resolves to this LB's host IP (or when the
 * server host is itself a name). Otherwise keep the raw LB IP as a safe fallback.
 */
export async function resolveDirectMediaHostname(
  server: DirectMediaServerFields
): Promise<string | null> {
  const domainHost = mediaHostnameFromServerDomain(server.domain);
  const ipOrHost = String(server.host || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .split(":")[0]
    ?.trim();
  if (!domainHost) return ipOrHost || null;
  if (!ipOrHost) return domainHost;
  if (!isIpHost(ipOrHost)) return domainHost;

  const cacheKey = `${domainHost}|${ipOrHost}`;
  const cached = dnsMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DNS_CACHE_MS) {
    return cached.useDomain ? domainHost : ipOrHost;
  }

  let useDomain = false;
  try {
    const { lookup } = await import("node:dns/promises");
    const results = await lookup(domainHost, { all: true, verbatim: true });
    useDomain = results.some((r) => r.address === ipOrHost);
  } catch {
    useDomain = false;
  }
  dnsMatchCache.set(cacheKey, { at: Date.now(), useDomain });
  return useDomain ? domainHost : ipOrHost;
}

/** http(s)://host for a direct-edge media origin (public :80 on remote edges). */
export async function directMediaOriginForServer(
  server: DirectMediaServerFields
): Promise<string | null> {
  const host = await resolveDirectMediaHostname(server);
  if (!host) return null;
  const proto =
    String(server.protocol || "http").toLowerCase() === "https" ? "https" : "http";
  return `${proto}://${formatHostForOrigin(host)}`;
}

/** Sync helper for unit tests (domain preferred; no DNS). */
export function directMediaOriginForServerSync(server: DirectMediaServerFields): string | null {
  const host = directMediaHostnameForServer(server);
  if (!host) return null;
  const proto =
    String(server.protocol || "http").toLowerCase() === "https" ? "https" : "http";
  return `${proto}://${formatHostForOrigin(host)}`;
}
