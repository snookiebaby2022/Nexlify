import type { Line } from "@prisma/client";

export function parseAllowedIps(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ipMatchesRule(clientIp: string, rule: string): boolean {
  const c = clientIp.trim();
  const r = rule.trim();
  if (!c || !r) return false;
  if (r.includes("/")) {
    const [base, bitsStr] = r.split("/");
    const bits = parseInt(bitsStr, 10);
    if (!base || Number.isNaN(bits)) return false;
    if (c === base) return true;
    if (bits === 32) return c === base;
    const prefix = base.split(".").slice(0, Math.floor(bits / 8)).join(".");
    return c.startsWith(prefix);
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
