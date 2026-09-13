import type { NextRequest } from "next/server";

export type ClientIpHeaders = {
  get(name: string): string | null;
};

function cleanIp(raw: string | null | undefined): string | undefined {
  let s = String(raw ?? "").trim();
  if (!s) return undefined;
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s === "unknown" || s === "null") return undefined;
  return s || undefined;
}

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0";
}

function isPublicish(ip: string): boolean {
  if (isLoopback(ip)) return false;
  if (ip.startsWith("10.")) return false;
  if (ip.startsWith("192.168.")) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  return true;
}

const DEFAULT_INFRA_IPS = new Set([
  "209.237.141.15", // 10gbs edge
  "45.88.138.18", // panel 45
]);

/** Panel / stream-node hops — never show these as the viewer IP. */
export function isInfraHopIp(ip?: string | null): boolean {
  const n = cleanIp(ip);
  if (!n) return false;
  if (DEFAULT_INFRA_IPS.has(n)) return true;
  const extra = process.env.NEXLIFY_INFRA_IPS ?? "";
  for (const part of extra.split(",")) {
    const hop = cleanIp(part);
    if (hop && hop === n) return true;
  }
  return false;
}

export function parseForwardedHops(xff: string | null | undefined): string[] {
  const hops: string[] = [];
  for (const part of String(xff ?? "").split(",")) {
    const ip = cleanIp(part);
    if (ip) hops.push(ip);
  }
  return hops;
}

/** Last non-loopback, non-infra hop (rightmost). XFF is client, proxy1, proxy2, nginx-peer. */
export function lastUntrustedHop(hops: string[]): string | undefined {
  for (let i = hops.length - 1; i >= 0; i--) {
    const ip = hops[i];
    if (!isLoopback(ip) && !isInfraHopIp(ip)) return ip;
  }
  return undefined;
}

/**
 * Viewer / login IP.
 * Prefer nginx X-Real-IP ($remote_addr) when it is a real client, then the
 * last XFF hop. Never the first XFF hop (clients can spoof that).
 */
export function resolveClientIp(headers: ClientIpHeaders): string | undefined {
  const real = cleanIp(headers.get("x-real-ip"));
  const lastXff = lastUntrustedHop(parseForwardedHops(headers.get("x-forwarded-for")));

  if (real && isPublicish(real) && !isInfraHopIp(real)) return real;
  if (lastXff && isPublicish(lastXff)) return lastXff;
  if (real && !isLoopback(real) && !isInfraHopIp(real)) return real;
  if (lastXff) return lastXff;
  return undefined;
}

/** Viewer IP for live-auth / connections. Skip loopback and fleet edge/panel hops. */
export function getClientIp(req: NextRequest): string | undefined {
  return resolveClientIp(req.headers);
}
