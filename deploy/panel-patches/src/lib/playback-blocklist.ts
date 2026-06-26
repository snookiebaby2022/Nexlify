import { prisma } from "@/lib/prisma";
import { cacheGetOrSet } from "@/lib/cache";

export type BlocklistDeny = "ip" | "asn" | "isp" | "user_agent";

async function loadBlocklists() {
  return cacheGetOrSet("playback:blocklists", 60, async () => {
    const [asns, ips, isps, uas] = await Promise.all([
      prisma.blockedAsn.findMany({ where: { isActive: true } }),
      prisma.blockedIp.findMany({ where: { isActive: true } }),
      prisma.blockedIsp.findMany({ where: { isActive: true } }),
      prisma.blockedUserAgent.findMany({ where: { isActive: true } }),
    ]);
    return { asns, ips, isps, uas };
  });
}

function ipMatches(value: string, clientIp: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.includes("/")) {
    const [base, bits] = v.split("/");
    const mask = Number(bits);
    if (!Number.isFinite(mask) || mask < 0 || mask > 32) return false;
    const toNum = (ip: string) =>
      ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
    try {
      const a = toNum(base);
      const b = toNum(clientIp);
      const m = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
      return (a & m) === (b & m);
    } catch {
      return false;
    }
  }
  return v === clientIp;
}

export async function checkPlaybackBlocklist(
  clientIp: string | undefined,
  userAgent: string | undefined,
  asn?: string | null,
  isp?: string | null
): Promise<BlocklistDeny | null> {
  const lists = await loadBlocklists();
  const ua = (userAgent ?? "").toLowerCase();

  if (clientIp) {
    for (const row of lists.ips) {
      if (ipMatches(row.value, clientIp)) return "ip";
    }
  }

  if (asn) {
    const normalized = asn.replace(/^AS/i, "").trim();
    for (const row of lists.asns) {
      const a = row.asn.replace(/^AS/i, "").trim();
      if (a === normalized || row.asn === asn) return "asn";
    }
  }

  if (isp) {
    const ispLower = isp.toLowerCase();
    for (const row of lists.isps) {
      if (ispLower.includes(row.name.toLowerCase())) return "isp";
    }
  }

  if (ua) {
    for (const row of lists.uas) {
      const pat = row.pattern.toLowerCase();
      if (pat && ua.includes(pat)) return "user_agent";
    }
  }

  return null;
}
