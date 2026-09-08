import { parseDnsRotator } from "@/lib/dns-rotator";
import { isValidPanelDomain, normalizeDomain } from "@/lib/domains-host";
import { formatHostForOrigin, isIpHost } from "@/lib/public-origin";

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

export type StreamServerDomainRole = "main" | "lb";

export type StreamServerDomainParse =
  | { ok: true; domain: string | null }
  | { ok: false; error: string };

function normalizeOneHost(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let host = "";
  try {
    const u = new URL(text.includes("://") ? text : `http://${text}`);
    host = u.hostname.toLowerCase();
  } catch {
    host = normalizeDomain(text);
  }
  if (!host) return null;
  if (IPV4_PATTERN.test(host) || (host.startsWith("[") && host.includes("]"))) {
    return host.replace(/^\[|\]$/g, "");
  }
  if (!isValidPanelDomain(host)) return null;
  return normalizeDomain(host);
}

/** Split a Domain Name field into hostnames (commas / whitespace / ; |). */
export function splitDomainNameField(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  const withoutScheme = text.replace(/^https?:\/\//i, "");
  return withoutScheme
    .split(/[,;\s|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Normalize Domain Name for a StreamServer.
 * - LB: exactly one hostname (reject comma-separated lists).
 * - Main: allow multiple hostnames (XUI-style media DNS pool); stored comma-joined.
 */
export function parseStreamServerDomain(
  raw: unknown,
  role: StreamServerDomainRole = "lb"
): StreamServerDomainParse {
  if (raw === undefined || raw === null) return { ok: true, domain: null };
  const text = String(raw).trim();
  if (!text) return { ok: true, domain: null };

  if (role === "main") {
    const parts = splitDomainNameField(text);
    if (!parts.length) return { ok: true, domain: null };
    const hosts: string[] = [];
    for (const part of parts) {
      const host = normalizeOneHost(part);
      if (!host) {
        return { ok: false, error: `Invalid Domain Name: ${part}` };
      }
      if (!hosts.includes(host)) hosts.push(host);
    }
    return { ok: true, domain: hosts.join(",") };
  }

  const authority = text.replace(/^https?:\/\//i, "").split("/")[0] ?? text;
  if (/[,;|]/.test(authority) || /\s/.test(authority)) {
    return {
      ok: false,
      error:
        "LB Domain Name must be exactly one hostname (e.g. lb2.stream.example.com). Put multiple stream DNS names on the main server Domain Name / DNS rotator instead.",
    };
  }

  const host = normalizeOneHost(text);
  if (!host) {
    return { ok: false, error: `Invalid Domain Name: ${text}` };
  }
  return { ok: true, domain: host };
}

/** First/single LB hostname from a domain field, or empty if invalid/multi. */
export function mediaHostnameFromServerDomain(domain: string | null | undefined): string {
  const parsed = parseStreamServerDomain(domain ?? "", "lb");
  if (!parsed.ok || !parsed.domain) return "";
  return parsed.domain;
}

/** All hostnames listed in a main (or LB) domain field. */
export function listDomainFieldHostnames(domain: string | null | undefined): string[] {
  const text = String(domain || "").trim();
  if (!text) return [];
  const out: string[] = [];
  for (const part of splitDomainNameField(text)) {
    const host = normalizeOneHost(part);
    if (host && !out.includes(host)) out.push(host);
  }
  return out;
}

export type DirectMediaServerFields = {
  host: string;
  domain?: string | null;
  protocol?: string | null;
  dnsRotator?: unknown;
};

export type MainMediaPoolServer = DirectMediaServerFields & {
  panelSettings?: unknown;
};

/** Hostnames from main Domain Name + DNS rotator (media advertisement pool). */
export function collectMainMediaHostPool(main: MainMediaPoolServer | null | undefined): string[] {
  if (!main) return [];
  const out: string[] = [];
  for (const h of listDomainFieldHostnames(main.domain)) {
    if (!out.includes(h)) out.push(h);
  }
  const rotator = parseDnsRotator(main.dnsRotator);
  if (rotator) {
    for (const raw of rotator.hosts) {
      const host = normalizeOneHost(raw);
      if (host && !out.includes(host)) out.push(host);
    }
  }
  return out;
}

function rawServerHost(server: { host?: string | null }): string {
  return (
    String(server.host || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .split(":")[0]
      ?.trim() || ""
  );
}

/**
 * Prefer a single configured LB domain; fall back to the server IP/host.
 * Multi-domain (comma) LB fields are ignored so we fall back to IP.
 */
export function directMediaHostnameForServer(server: DirectMediaServerFields): string | null {
  const fromDomain = mediaHostnameFromServerDomain(server.domain);
  if (fromDomain) return fromDomain;
  return rawServerHost(server) || null;
}

const dnsMatchCache = new Map<string, { at: number; matches: boolean }>();
const DNS_CACHE_MS = 60_000;

export async function hostnameResolvesToTarget(
  hostname: string,
  targetHost: string
): Promise<boolean> {
  const host = hostname.trim().toLowerCase();
  const target = targetHost.trim().toLowerCase();
  if (!host || !target) return false;
  if (host === target) return true;
  if (!isIpHost(target)) return true;

  const cacheKey = `${host}|${target}`;
  const cached = dnsMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DNS_CACHE_MS) return cached.matches;

  let matches = false;
  try {
    const { lookup } = await import("node:dns/promises");
    const results = await lookup(host, { all: true, verbatim: true });
    matches = results.some((r) => r.address === target);
  } catch {
    matches = false;
  }
  dnsMatchCache.set(cacheKey, { at: Date.now(), matches });
  return matches;
}

function stickyPickIndex(seed: string, len: number): number {
  if (len <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % len;
}

/**
 * Advertised media hostname for a sticky LB assignment:
 * 1) LB's own Domain Name when DNS points at that LB
 * 2) else a main-server multi-domain / rotator hostname that DNS-points at the LB
 * 3) else the LB IP
 * Never returns the main panel IP while an LB host exists.
 */
export async function resolveAdvertisedMediaHostname(opts: {
  lb: DirectMediaServerFields;
  mainPoolHosts?: string[];
  lineId?: string;
  /** Optional panel/main IP — never advertise this as media. */
  panelHost?: string | null;
}): Promise<string | null> {
  const lbIp = rawServerHost(opts.lb);
  if (!lbIp) return null;
  const panelHost = String(opts.panelHost || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.split(":")[0]
    ?.toLowerCase();

  const rejectIfPanel = (host: string | null): string | null => {
    if (!host) return null;
    if (panelHost && host.toLowerCase() === panelHost && host !== lbIp) return null;
    if (panelHost && isIpHost(host) && host === panelHost && lbIp !== panelHost) return null;
    return host;
  };

  const lbDomain = mediaHostnameFromServerDomain(opts.lb.domain);
  if (lbDomain && (await hostnameResolvesToTarget(lbDomain, lbIp))) {
    return rejectIfPanel(lbDomain) ?? lbIp;
  }

  const pool = (opts.mainPoolHosts || []).filter(Boolean);
  if (pool.length) {
    const start = stickyPickIndex(opts.lineId || lbIp, pool.length);
    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[(start + i) % pool.length];
      if (isIpHost(candidate)) {
        if (candidate === lbIp) return lbIp;
        continue;
      }
      if (await hostnameResolvesToTarget(candidate, lbIp)) {
        return rejectIfPanel(candidate) ?? lbIp;
      }
    }
  }

  return rejectIfPanel(lbIp) ?? lbIp;
}

export async function resolveDirectMediaHostname(
  server: DirectMediaServerFields
): Promise<string | null> {
  return resolveAdvertisedMediaHostname({ lb: server });
}

export async function directMediaOriginForServer(
  server: DirectMediaServerFields,
  opts?: { mainPoolHosts?: string[]; lineId?: string; panelHost?: string | null }
): Promise<string | null> {
  const host = await resolveAdvertisedMediaHostname({
    lb: server,
    mainPoolHosts: opts?.mainPoolHosts,
    lineId: opts?.lineId,
    panelHost: opts?.panelHost,
  });
  if (!host) return null;
  const proto =
    String(server.protocol || "http").toLowerCase() === "https" ? "https" : "http";
  return `${proto}://${formatHostForOrigin(host)}`;
}

/** Sync helper for unit tests (LB domain preferred; no DNS / main pool). */
export function directMediaOriginForServerSync(server: DirectMediaServerFields): string | null {
  const host = directMediaHostnameForServer(server);
  if (!host) return null;
  const proto =
    String(server.protocol || "http").toLowerCase() === "https" ? "https" : "http";
  return `${proto}://${formatHostForOrigin(host)}`;
}

/** Sync pick among main pool without DNS — for unit tests. */
export function pickAdvertisedMediaHostnameSync(opts: {
  lbHost: string;
  lbDomain?: string | null;
  mainPoolHosts?: string[];
  lineId?: string;
  panelHost?: string | null;
}): string {
  const lbIp = opts.lbHost;
  const lbDomain = mediaHostnameFromServerDomain(opts.lbDomain ?? "");
  if (lbDomain) return lbDomain;
  const pool = (opts.mainPoolHosts || []).filter(
    (h) => h && (!opts.panelHost || h !== opts.panelHost || h === lbIp)
  );
  if (pool.length) {
    const idx = stickyPickIndex(opts.lineId || lbIp, pool.length);
    const pick = pool[idx];
    if (pick && !(isIpHost(pick) && opts.panelHost && pick === opts.panelHost && pick !== lbIp)) {
      return pick;
    }
  }
  return lbIp;
}
