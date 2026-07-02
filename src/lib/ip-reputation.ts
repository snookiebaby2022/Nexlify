import { cacheGetOrSet } from "@/lib/cache";
import { getSettingGroup } from "@/lib/panel-settings";
import { isPluginEntitled } from "@/lib/plugin-entitlement";
import { lookupGeo, type GeoLookup } from "@/lib/geoip";

export type IpReputation = {
  ip: string;
  isVpn: boolean;
  isProxy: boolean;
  isDatacenter: boolean;
  isTor: boolean;
  fraudScore: number;
  countryCode: string | null;
  isp: string | null;
  source: "maxmind" | "ipqs" | "heuristic";
};

export async function isSecurityShieldEnabled(panelHost?: string): Promise<boolean> {
  const entitled = await isPluginEntitled("security_shield", panelHost);
  if (!entitled.ok) return false;
  const s = await getSettingGroup("security-shield" as never);
  return s.enabled === true;
}

async function lookupIpQualityScore(ip: string, apiKey: string): Promise<Partial<IpReputation> | null> {
  try {
    const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(apiKey)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (data.success === false) return null;
    return {
      isVpn: Boolean(data.vpn),
      isProxy: Boolean(data.proxy),
      isDatacenter: Boolean(data.host),
      isTor: Boolean(data.tor),
      fraudScore: Number(data.fraud_score ?? 0),
      countryCode: data.country_code ? String(data.country_code) : null,
      isp: data.ISP ? String(data.ISP) : null,
      source: "ipqs",
    };
  } catch {
    return null;
  }
}

function heuristicFromGeo(geo: GeoLookup | null): Partial<IpReputation> {
  const hosting = geo?.isVpnOrHosting ?? false;
  return {
    isVpn: hosting,
    isProxy: hosting,
    isDatacenter: hosting,
    isTor: false,
    fraudScore: hosting ? 75 : 0,
    countryCode: geo?.countryCode ?? null,
    isp: geo?.isp ?? null,
    source: "heuristic",
  };
}

export async function checkIpReputation(ip: string): Promise<IpReputation> {
  return cacheGetOrSet(`iprep:${ip}`, 1800, async () => {
    const settings = await getSettingGroup("security-shield" as never);
    const geo = await lookupGeo(ip);

    const apiKey = String(settings.ipqsApiKey ?? "").trim();
    if (apiKey) {
      const ipqs = await lookupIpQualityScore(ip, apiKey);
      if (ipqs) {
        return {
          ip,
          isVpn: ipqs.isVpn ?? false,
          isProxy: ipqs.isProxy ?? false,
          isDatacenter: ipqs.isDatacenter ?? false,
          isTor: ipqs.isTor ?? false,
          fraudScore: ipqs.fraudScore ?? 0,
          countryCode: ipqs.countryCode ?? geo?.countryCode ?? null,
          isp: ipqs.isp ?? geo?.isp ?? null,
          source: "ipqs",
        };
      }
    }

    const h = heuristicFromGeo(geo);
    return {
      ip,
      isVpn: h.isVpn ?? false,
      isProxy: h.isProxy ?? false,
      isDatacenter: h.isDatacenter ?? false,
      isTor: h.isTor ?? false,
      fraudScore: h.fraudScore ?? 0,
      countryCode: h.countryCode ?? null,
      isp: h.isp ?? null,
      source: geo ? "maxmind" : "heuristic",
    };
  });
}

export async function shouldBlockByReputation(ip: string): Promise<{
  block: boolean;
  flag: boolean;
  reputation: IpReputation;
  reason?: string;
}> {
  const enabled = await isSecurityShieldEnabled();
  if (!enabled) {
    return {
      block: false,
      flag: false,
      reputation: {
        ip,
        isVpn: false,
        isProxy: false,
        isDatacenter: false,
        isTor: false,
        fraudScore: 0,
        countryCode: null,
        isp: null,
        source: "heuristic",
      },
    };
  }

  const settings = await getSettingGroup("security-shield" as never);
  const rep = await checkIpReputation(ip);
  const threshold = Number(settings.fraudScoreBlockThreshold ?? 85);
  const flagThreshold = Number(settings.fraudScoreFlagThreshold ?? 60);

  if (settings.blockVpn && (rep.isVpn || rep.isProxy)) {
    return { block: true, flag: true, reputation: rep, reason: "vpn_proxy" };
  }
  if (settings.blockDatacenter && rep.isDatacenter) {
    return { block: true, flag: true, reputation: rep, reason: "datacenter" };
  }
  if (settings.blockTor && rep.isTor) {
    return { block: true, flag: true, reputation: rep, reason: "tor" };
  }
  if (rep.fraudScore >= threshold) {
    return { block: true, flag: true, reputation: rep, reason: "fraud_score" };
  }
  if (rep.fraudScore >= flagThreshold) {
    return { block: false, flag: true, reputation: rep, reason: "flagged" };
  }

  return { block: false, flag: false, reputation: rep };
}
