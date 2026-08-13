import type { Line } from "@prisma/client";

export function parseAllowedIps(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = ((n << 8) | v) >>> 0;
  }
  return n;
}

function parseIpv4Cidr(rule: string): { base: number; mask: number } | null {
  const [baseStr, bitsStr] = rule.split("/");
  const base = ipv4ToInt(baseStr?.trim() ?? "");
  const bits = Number(bitsStr);
  if (base == null || !Number.isFinite(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

/** Expand abbreviated IPv6 (::) into 8 hextets. */
function expandIpv6(ip: string): number[] | null {
  const raw = ip.trim().toLowerCase();
  if (!raw.includes(":")) return null;
  if (raw.includes(".")) {
    // IPv4-mapped not needed for line locks; reject mixed forms for simplicity.
    return null;
  }
  const halves = raw.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").filter(Boolean) : [];
  if (halves.length === 1) {
    if (left.length !== 8) return null;
  } else {
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    left.push(...Array(missing).fill("0"), ...right);
  }
  if (left.length !== 8) return null;
  const out: number[] = [];
  for (const h of left) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
    out.push(parseInt(h, 16));
  }
  return out;
}

function parseIpv6Cidr(rule: string): { base: number[]; bits: number } | null {
  const [baseStr, bitsStr] = rule.split("/");
  const base = expandIpv6(baseStr?.trim() ?? "");
  const bits = Number(bitsStr);
  if (!base || !Number.isFinite(bits) || bits < 0 || bits > 128) return null;
  return { base, bits };
}

function ipv6MatchesCidr(client: number[], cidr: { base: number[]; bits: number }): boolean {
  let remaining = cidr.bits;
  for (let i = 0; i < 8; i++) {
    if (remaining <= 0) return true;
    const take = Math.min(16, remaining);
    const shift = 16 - take;
    const mask = take === 16 ? 0xffff : (0xffff << shift) & 0xffff;
    if ((client[i] & mask) !== (cidr.base[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

/** Match client IP against exact IP or CIDR (IPv4 / IPv6), e.g. 10.0.0.0/8 or 2001:db8::/32. */
export function ipMatchesRule(clientIp: string, rule: string): boolean {
  const c = clientIp.trim();
  const r = rule.trim();
  if (!c || !r) return false;

  if (r.includes("/")) {
    if (c.includes(":")) {
      const client = expandIpv6(c);
      const cidr = parseIpv6Cidr(r);
      if (!client || !cidr) return false;
      return ipv6MatchesCidr(client, cidr);
    }
    const client = ipv4ToInt(c);
    const cidr = parseIpv4Cidr(r);
    if (client == null || !cidr) return false;
    return (client & cidr.mask) >>> 0 === cidr.base;
  }

  if (c.includes(":") || r.includes(":")) {
    const a = expandIpv6(c);
    const b = expandIpv6(r);
    if (!a || !b) return c.toLowerCase() === r.toLowerCase();
    return a.every((v, i) => v === b[i]);
  }
  return c === r;
}

export function clientIpAllowed(allowed: string[], clientIp: string | undefined): boolean {
  if (!allowed.length) return false;
  const ip = clientIp?.trim();
  if (!ip) return false;
  return allowed.some((rule) => ipMatchesRule(ip, rule));
}

/** Returns true if playback is allowed, false if blocked. */
export function checkLineIpAccess(
  line: Pick<Line, "lockToIp" | "allowedIps">,
  clientIp: string | undefined
): boolean {
  if (!line.lockToIp) return true;
  const allowed = parseAllowedIps(line.allowedIps);
  if (!allowed.length) return true;
  return clientIpAllowed(allowed, clientIp);
}
