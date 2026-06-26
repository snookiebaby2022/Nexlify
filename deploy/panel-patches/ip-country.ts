/** Client-safe IP parsing and flag emoji helpers (no Node/fs). */

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

const IPV6_RE =
  /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:))$/i;

export function isIpv4(value: string): boolean {
  return IPV4_RE.test(value);
}

export function isIpv6(value: string): boolean {
  const v = value.toLowerCase();
  if (!v.includes(":")) return false;
  return IPV6_RE.test(v) || v === "::1";
}

/** ISO 3166-1 alpha-2 → regional-indicator flag emoji (no dependencies). */
export function countryCodeToFlag(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    ...[...cc].map((c) => base + c.charCodeAt(0) - 65)
  );
}

export function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const cc = code.trim().toUpperCase();
  if (cc === "UK") return "GB";
  return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

function ipv4ToInt(ip: string): number | null {
  if (!isIpv4(ip)) return null;
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  return (
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
  );
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v) return true;

  if (isIpv4(v)) {
    const n = ipv4ToInt(v);
    if (n === null) return true;
    const a = (n >>> 24) & 0xff;
    const b = (n >>> 16) & 0xff;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }

  if (isIpv6(v) || v.includes(":")) {
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80:") || v.startsWith("fe80::")) return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true;
    if (v.startsWith("::ffff:")) {
      const mapped = v.slice(7);
      if (isIpv4(mapped)) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }

  return true;
}

/** Pull a literal IPv4/IPv6 from host, host:port, or protocol URLs. Domains return null. */
export function extractIpAddress(input: string): string | null {
  let s = input.trim();
  if (!s || s === "—" || s === "-") return null;

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  s = s.split("/")[0] ?? s;

  const bracket = s.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) {
    const inner = bracket[1]!.toLowerCase();
    return isIpv6(inner) || inner.includes(":") ? inner : null;
  }

  if (s.includes(":") && !s.includes("::")) {
    const idx = s.lastIndexOf(":");
    const hostPart = s.slice(0, idx);
    const portPart = s.slice(idx + 1);
    if (/^\d+$/.test(portPart) && (isIpv4(hostPart) || isIpv6(hostPart))) {
      return hostPart.toLowerCase();
    }
  }

  if (isIpv4(s)) return s;
  const lower = s.toLowerCase();
  if (isIpv6(lower)) return lower;

  return null;
}

export function isPublicIp(input: string): boolean {
  const ip = extractIpAddress(input);
  if (!ip) return false;
  return !isPrivateOrReservedIp(ip);
}
