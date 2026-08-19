import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) + o;
  }
  return n >>> 0;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const v = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (v === "::1" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.startsWith("::ffff:")) return isPrivateOrReservedIp(v.slice(7));
  const n = ipv4ToInt(v);
  if (n == null) return BLOCKED_HOSTS.has(v);
  const inRange = (start: string, end: string) => {
    const a = ipv4ToInt(start);
    const b = ipv4ToInt(end);
    return a != null && b != null && n >= a && n <= b;
  };
  return (
    inRange("0.0.0.0", "0.255.255.255") ||
    inRange("10.0.0.0", "10.255.255.255") ||
    inRange("127.0.0.0", "127.255.255.255") ||
    inRange("169.254.0.0", "169.254.255.255") ||
    inRange("172.16.0.0", "172.31.255.255") ||
    inRange("192.168.0.0", "192.168.255.255") ||
    inRange("100.64.0.0", "100.127.255.255") ||
    inRange("192.0.2.0", "192.0.2.255") ||
    inRange("198.51.100.0", "198.51.100.255") ||
    inRange("203.0.113.0", "203.0.113.255") ||
    inRange("224.0.0.0", "239.255.255.255") ||
    inRange("255.255.255.255", "255.255.255.255")
  );
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("URL host is not allowed");
  }
  if (isIP(host) && isPrivateOrReservedIp(host)) {
    throw new Error("Private or reserved IP addresses are not allowed");
  }
  if (!isIP(host)) {
    let records: { address: string }[];
    try {
      records = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error("Could not resolve URL host");
    }
    if (!records.length || records.some((r) => isPrivateOrReservedIp(r.address))) {
      throw new Error("URL host resolves to a private or reserved address");
    }
  }
  return parsed;
}
