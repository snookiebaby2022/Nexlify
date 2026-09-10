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

/**
 * First/single LB hostname from a domain field.
 * Tolerates a comma-separated DB value (legacy / UI mistakes) by taking the first
 * valid hostname so advertise can still publish stream DNS instead of falling to LB IP.
 */
export function mediaHostnameFromServerDomain(domain: string | null | undefined): string {
  const parsed = parseStreamServerDomain(domain ?? "", "lb");
  if (parsed.ok && parsed.domain) return parsed.domain;
  const hosts = listDomainFieldHostnames(domain);
  return hosts[0] || "";
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

function normalizeAdvertiseHost(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.split(":")[0]
    ?.toLowerCase() || "";
}

/**
 * Advertised media hostname for a sticky LB assignment (XUI-style direct edge):
 * Only advertise a hostname when its A/AAAA records include the LB IP.
 * Otherwise advertise the LB IP so players never hairpin through the panel
 * (panel proxy NIC ≈1G wall). Multi-domain still works when DNS points at the LB.
 * Never returns the main panel IP while an LB host exists.
 *
 * Preference (XUI.ONE-style):
 * 1) Login Host (player_api DNS) when it resolves to this LB
 * 2) NEXLIFY_MEDIA_ORIGIN when DNS→LB
 * 3) LB Domain Name when DNS→LB
 * 4) Main Domain Name / DNS rotator pool when DNS→LB
 * 5) LB IP
 */
export async function resolveAdvertisedMediaHostname(opts: {
  lb: DirectMediaServerFields;
  mainPoolHosts?: string[];
  lineId?: string;
  /** Optional panel/main IP — never advertise this as media (unless monolith shares LB IP). */
  panelHost?: string | null;
  /** Hostname the IPTV client used to login — prefer when DNS points at this LB. */
  loginHost?: string | null;
}): Promise<string | null> {
  const lbIp = rawServerHost(opts.lb);
  if (!lbIp) return null;

  // Nuclear: always publish LB IP (zero panel proxy from new player_api sessions).
  // Checked before MEDIA_ORIGIN hostname so operators can force IP even when a
  // domain is configured / DNS-matches the LB.
  if (/^(1|true|yes)$/i.test(String(process.env.NEXLIFY_MEDIA_FORCE_LB_IP || "").trim())) {
    return lbIp;
  }

  const panelHost = normalizeAdvertiseHost(opts.panelHost);
  // Monolith: panel IP === LB IP — domains that resolve there are valid media hosts.
  const panelIsSeparateFromLb = Boolean(panelHost && panelHost !== lbIp);

  const rejectIfPanel = (host: string | null): string | null => {
    if (!host) return null;
    if (panelIsSeparateFromLb && host.toLowerCase() === panelHost) return null;
    if (panelIsSeparateFromLb && isIpHost(host) && host === panelHost) return null;
    return host;
  };

  const loginHost = normalizeAdvertiseHost(opts.loginHost);
  if (
    loginHost &&
    rejectIfPanel(loginHost) &&
    (loginHost === lbIp || (await hostnameResolvesToTarget(loginHost, lbIp)))
  ) {
    // Login DNS→LB: advertise the same hostname apps already dialed (XUI behavior).
    if (!(panelIsSeparateFromLb && (await hostnameResolvesToTarget(loginHost, panelHost)))) {
      return loginHost;
    }
  }

  // Prefer configured media origin hostname when DNS points at this LB (e.g. darkcdn.site).
  const configuredOrigin = String(process.env.NEXLIFY_MEDIA_ORIGIN || "").trim();
  if (configuredOrigin) {
    try {
      const configuredHost = new URL(
        configuredOrigin.includes("://") ? configuredOrigin : `http://${configuredOrigin}`
      ).hostname.toLowerCase();
      if (
        configuredHost &&
        rejectIfPanel(configuredHost) &&
        (await hostnameResolvesToTarget(configuredHost, lbIp))
      ) {
        if (!(panelIsSeparateFromLb && (await hostnameResolvesToTarget(configuredHost, panelHost)))) {
          return configuredHost;
        }
      }
    } catch {
      /* ignore bad origin */
    }
  }

  const lbDomain = mediaHostnameFromServerDomain(opts.lb.domain);
  if (lbDomain && rejectIfPanel(lbDomain) && (await hostnameResolvesToTarget(lbDomain, lbIp))) {
    if (!(panelIsSeparateFromLb && (await hostnameResolvesToTarget(lbDomain, panelHost)))) {
      return lbDomain;
    }
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
      if (!rejectIfPanel(candidate)) continue;
      // Skip hostnames that resolve to the panel (hairpin / ~1G wall).
      if (panelIsSeparateFromLb && (await hostnameResolvesToTarget(candidate, panelHost))) continue;
      if (await hostnameResolvesToTarget(candidate, lbIp)) {
        return candidate;
      }
    }
  }

  return lbIp;
}

export async function resolveDirectMediaHostname(
  server: DirectMediaServerFields
): Promise<string | null> {
  return resolveAdvertisedMediaHostname({ lb: server });
}

export async function directMediaOriginForServer(
  server: DirectMediaServerFields,
  opts?: {
    mainPoolHosts?: string[];
    lineId?: string;
    panelHost?: string | null;
    loginHost?: string | null;
    /** Full login origin (scheme) — when advertised host matches login Host, inherit http/https. */
    loginOrigin?: string | null;
  }
): Promise<string | null> {
  const loginHost =
    opts?.loginHost ||
    (opts?.loginOrigin ? normalizeAdvertiseHost(opts.loginOrigin) : "") ||
    null;
  const host = await resolveAdvertisedMediaHostname({
    lb: server,
    mainPoolHosts: opts?.mainPoolHosts,
    lineId: opts?.lineId,
    panelHost: opts?.panelHost,
    loginHost,
  });
  if (!host) return null;
  let proto =
    String(server.protocol || "http").toLowerCase() === "https" ? "https" : "http";
  // Bare IP media hosts have no trustworthy cert — never advertise https://IP.
  if (isIpHost(host)) {
    proto = "http";
  }
  // Honor configured media origin scheme (e.g. https://darkcdn.site) over LB row http.
  const configuredOrigin = String(process.env.NEXLIFY_MEDIA_ORIGIN || "").trim();
  if (configuredOrigin && !isIpHost(host)) {
    try {
      const cfg = new URL(
        configuredOrigin.includes("://") ? configuredOrigin : `http://${configuredOrigin}`
      );
      if (cfg.protocol === "https:") proto = "https";
    } catch {
      /* ignore */
    }
  }
  // XUI: same-host login may upgrade to https. Never downgrade LB/media https to http —
  // edge often forwards player_api to the panel over plain HTTP, and some IPTV UAs force
  // http in serverBaseUrl even when the client dialed :443 with a trusted cert.
  if (loginHost && host.toLowerCase() === loginHost.toLowerCase() && opts?.loginOrigin) {
    try {
      const u = new URL(
        opts.loginOrigin.includes("://") ? opts.loginOrigin : `http://${opts.loginOrigin}`
      );
      if (u.protocol === "https:") proto = "https";
    } catch {
      /* keep proto */
    }
  }
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
  loginHost?: string | null;
}): string {
  const lbIp = opts.lbHost;
  const panelHost = opts.panelHost || "";
  const panelIsSeparateFromLb = Boolean(panelHost && panelHost !== lbIp);
  const loginHost = String(opts.loginHost || "")
    .trim()
    .toLowerCase();
  if (
    loginHost &&
    !(panelIsSeparateFromLb && loginHost === panelHost) &&
    (loginHost === lbIp || !isIpHost(loginHost))
  ) {
    return loginHost;
  }
  const lbDomain = mediaHostnameFromServerDomain(opts.lbDomain ?? "");
  if (lbDomain) return lbDomain;
  const pool = (opts.mainPoolHosts || []).filter(
    (h) => h && (!panelIsSeparateFromLb || h !== panelHost || h === lbIp)
  );
  if (pool.length) {
    const idx = stickyPickIndex(opts.lineId || lbIp, pool.length);
    const pick = pool[idx];
    if (pick && !(isIpHost(pick) && panelIsSeparateFromLb && pick === panelHost && pick !== lbIp)) {
      return pick;
    }
  }
  return lbIp;
}
