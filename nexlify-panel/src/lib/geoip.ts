import fs from "fs";
import { cacheGetOrSet } from "@/lib/cache";
import { getSettingGroup } from "@/lib/panel-settings";

export type GeoLookup = {
  countryCode: string | null;
  countryName: string | null;
  isp: string | null;
  asn: string | null;
  isVpnOrHosting: boolean;
};

type MmdbReader = {
  get: (ip: string) => {
    country?: { iso_code?: string };
    traits?: { isp?: string; autonomous_system_number?: number };
  } | null;
};

let mmdbReader: MmdbReader | null = null;

async function loadMmdb(path: string) {
  if (mmdbReader) return mmdbReader;
  if (!path || !fs.existsSync(path)) return null;
  try {
    const { Reader } = await import("mmdb-lib");
    const buf = fs.readFileSync(path);
    mmdbReader = new Reader(buf) as unknown as MmdbReader;
    return mmdbReader;
  } catch {
    return null;
  }
}

async function lookupIpApi(ip: string): Promise<GeoLookup | null> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "NexlifyPanel/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const org = String(data.org ?? "");
    const hosting = /hosting|vpn|proxy|datacenter|cloud|server/i.test(org);
    return {
      countryCode: data.country_code ? String(data.country_code) : null,
      countryName: data.country_name ? String(data.country_name) : null,
      isp: org || null,
      asn: data.asn ? String(data.asn) : null,
      isVpnOrHosting: hosting,
    };
  } catch {
    return null;
  }
}

export async function lookupGeo(ip: string | undefined): Promise<GeoLookup | null> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::")) return null;

  return cacheGetOrSet(`geo:${ip}`, 3600, async () => {
    const geo = await getSettingGroup("geo");
    const maxmindPath = String(geo.maxmindDbPath ?? "");

    const reader = await loadMmdb(maxmindPath);
    if (reader) {
      try {
        const rec = reader.get(ip);
        const asnNum = rec?.traits?.autonomous_system_number;
        const isp = rec?.traits?.isp ?? null;
        const hosting = isp
          ? /hosting|vpn|proxy|datacenter|cloud/i.test(isp)
          : false;
        return {
          countryCode: rec?.country?.iso_code ?? null,
          countryName: null,
          isp,
          asn: asnNum != null ? `AS${asnNum}` : null,
          isVpnOrHosting: hosting,
        };
      } catch {
        /* fall through */
      }
    }

    return lookupIpApi(ip);
  });
}

export function parseCountryList(raw: string | null | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length === 2)
  );
}

export function lineCountryAllowed(
  line: { allowedCountries?: string | null; blockedCountries?: string | null },
  countryCode: string | null
): boolean {
  if (!countryCode) return true;
  const cc = countryCode.toUpperCase();
  const blocked = parseCountryList(line.blockedCountries);
  if (blocked.has(cc)) return false;
  const allowed = parseCountryList(line.allowedCountries);
  if (allowed.size > 0 && !allowed.has(cc)) return false;
  return true;
}
