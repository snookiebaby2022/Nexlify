export type DnsRotatorMode = "round_robin" | "random";

export type DnsRotatorConfig = {
  mode: DnsRotatorMode;
  hosts: string[];
};

const HOST_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/;

export function parseDnsRotator(raw: unknown): DnsRotatorConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "random" ? "random" : "round_robin";
  const hosts = Array.isArray(o.hosts)
    ? o.hosts.map((h) => String(h).trim()).filter(Boolean)
    : [];
  if (!hosts.length) return null;
  return { mode, hosts };
}

export function validateDnsRotator(raw: unknown): string | null {
  const cfg = parseDnsRotator(raw);
  if (!cfg) return null;
  for (const h of cfg.hosts) {
    if (h.includes(" ") || h.includes(";") || h.includes("|") || h.includes("$")) {
      return "DNS rotator hosts must not contain shell metacharacters";
    }
    if (!HOST_PATTERN.test(h) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
      return `Invalid rotator host: ${h}`;
    }
  }
  return null;
}

let rrIndex = 0;

export function pickRotatorHost(cfg: DnsRotatorConfig, seed?: string): string {
  if (cfg.mode === "random") {
    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
      return cfg.hosts[hash % cfg.hosts.length];
    }
    return cfg.hosts[Math.floor(Math.random() * cfg.hosts.length)];
  }
  const host = cfg.hosts[rrIndex % cfg.hosts.length];
  rrIndex += 1;
  return host;
}

export function applyRotatorToUrl(url: string, host: string): string {
  try {
    const u = new URL(url);
    u.hostname = host;
    return u.toString();
  } catch {
    return url.replace(/^(https?:\/\/)([^/:]+)/, `$1${host}`);
  }
}

export function resolveRotatorUrl(
  url: string,
  rotator: unknown,
  seed?: string
): string {
  const cfg = parseDnsRotator(rotator);
  if (!cfg) return url;
  const host = pickRotatorHost(cfg, seed);
  return applyRotatorToUrl(url, host);
}
