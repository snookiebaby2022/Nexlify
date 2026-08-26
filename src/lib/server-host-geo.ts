import { lookup } from "node:dns/promises";
import { lookupGeo } from "@/lib/geoip";
import {
  extractHostname,
  extractIpAddress,
  isPrivateOrReservedIp,
  isPublicIp,
  normalizeCountryCode,
} from "@/lib/ip-country";

export type ServerHostGeo = {
  host: string;
  ip: string | null;
  countryCode: string | null;
  countryName: string | null;
};

export async function resolveHostnameToIp(hostname: string): Promise<string | null> {
  const host = extractHostname(hostname);
  if (!host) return null;
  const literal = extractIpAddress(host);
  if (literal) return literal;
  try {
    const found = await lookup(host, { verbatim: true });
    return found.address || null;
  } catch {
    return null;
  }
}

export async function resolveServerHostGeo(rawHost: string): Promise<ServerHostGeo> {
  const host = extractHostname(rawHost) ?? rawHost.trim();
  const ip = (await resolveHostnameToIp(host)) ?? extractIpAddress(rawHost);
  if (!ip || isPrivateOrReservedIp(ip) || !isPublicIp(ip)) {
    return { host, ip, countryCode: null, countryName: null };
  }
  const geo = await lookupGeo(ip);
  return {
    host,
    ip,
    countryCode: normalizeCountryCode(geo?.countryCode) ?? null,
    countryName: geo?.countryName ?? null,
  };
}
