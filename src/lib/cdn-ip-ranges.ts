/** Cloudflare & Bunny CDN IP ranges for nginx real_ip and panel trust checks. */

export const CLOUDFLARE_IPV4_URL = "https://www.cloudflare.com/ips-v4";
export const CLOUDFLARE_IPV6_URL = "https://www.cloudflare.com/ips-v6";
export const BUNNY_IPS_URL = "https://bunnycdn.com/api/system/ips";

/** Fallback if live fetch fails (subset — sync updates full list in settings). */
export const CLOUDFLARE_IPV4_FALLBACK = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

export const BUNNY_IPV4_FALLBACK = [
  "185.195.92.0/22",
  "185.195.96.0/22",
  "185.195.100.0/22",
  "185.195.104.0/22",
  "45.82.252.0/22",
  "45.82.248.0/22",
  "94.158.248.0/22",
  "212.102.8.0/24",
];

export function parseIpList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s && (s.includes("/") || /^\d{1,3}(\.\d{1,3}){3}$/.test(s)));
}

function ipToLong(ip: string): number | null {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** IPv4 CIDR match (e.g. 104.16.0.0/13). */
export function ipv4InCidr(ip: string, cidr: string): boolean {
  const bare = ip.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return false;
  const [net, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr ?? "32", 10);
  if (!net || !Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const ipNum = ipToLong(bare);
  const netNum = ipToLong(net);
  if (ipNum == null || netNum == null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

export function ipv4InAnyCidr(ip: string, cidrs: string[]): boolean {
  if (!ip || !cidrs.length) return false;
  for (const c of cidrs) {
    if (c.includes(":")) continue;
    if (!c.includes("/")) {
      if (ip === c) return true;
      continue;
    }
    if (ipv4InCidr(ip, c)) return true;
  }
  return false;
}

export async function fetchCloudflareIpLists(): Promise<{ v4: string[]; v6: string[] }> {
  try {
    const [v4Res, v6Res] = await Promise.all([
      fetch(CLOUDFLARE_IPV4_URL, { next: { revalidate: 3600 } }),
      fetch(CLOUDFLARE_IPV6_URL, { next: { revalidate: 3600 } }),
    ]);
    const v4 = v4Res.ok ? parseIpList(await v4Res.text()) : [];
    const v6 = v6Res.ok ? parseIpList(await v6Res.text()) : [];
    return {
      v4: v4.length ? v4 : [...CLOUDFLARE_IPV4_FALLBACK],
      v6,
    };
  } catch {
    return { v4: [...CLOUDFLARE_IPV4_FALLBACK], v6: [] };
  }
}

export async function fetchBunnyIpList(): Promise<string[]> {
  try {
    const res = await fetch(BUNNY_IPS_URL, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error("bunny fetch failed");
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) {
        return data.map(String).filter((s) => s.includes(".") || s.includes(":"));
      }
      if (data && typeof data === "object" && Array.isArray((data as { ips?: string[] }).ips)) {
        return (data as { ips: string[] }).ips;
      }
    }
    return parseIpList(await res.text());
  } catch {
    return [...BUNNY_IPV4_FALLBACK];
  }
}

export function nginxRealIpSnippet(opts: {
  cloudflareV4: string[];
  cloudflareV6: string[];
  bunnyV4: string[];
}): string {
  const lines: string[] = [
    "# Nexlify — trust CDN edge IPs for real client IP",
    "real_ip_header X-Forwarded-For;",
    "real_ip_recursive on;",
    "",
    "# Cloudflare",
  ];
  for (const c of opts.cloudflareV4) lines.push(`set_real_ip_from ${c};`);
  for (const c of opts.cloudflareV6) lines.push(`set_real_ip_from ${c};`);
  lines.push("", "# Bunny CDN");
  for (const c of opts.bunnyV4) lines.push(`set_real_ip_from ${c};`);
  return lines.join("\n");
}
