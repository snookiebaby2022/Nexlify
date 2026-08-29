import { getServerLoadScores } from "@/lib/server-load";
import { preferHeadroomPool } from "@/lib/server-load-metrics";
import { pickServerForClient, serverMatchesGeo } from "@/lib/server-geo-lb";
import { lookupGeo } from "@/lib/geoip";
import { getSettingGroup, isBundledFeaturePacksEnabled } from "@/lib/panel-settings";
import { isPluginEntitled } from "@/lib/plugin-entitlement";

export type LbServerScore = {
  serverId: string;
  score: number;
  online: boolean;
  bandwidthMbps: number | null;
  healthStatus: string;
  reasons: string[];
};

export async function isLbProEnabled(panelHost?: string): Promise<boolean> {
  if (await isBundledFeaturePacksEnabled()) return true;
  const entitled = await isPluginEntitled("lb_pro", panelHost);
  if (!entitled.ok) return false;
  const s = await getSettingGroup("lb-pro" as never);
  return s.enabled === true;
}

/** Intelligent LB: health + geo + bandwidth-weighted server selection. */
export async function pickIntelligentServer(
  clientIp?: string,
  requiredBandwidthKbps?: number
): Promise<string | null> {
  const [lbSettings, scores] = await Promise.all([
    getSettingGroup("lb-pro" as never),
    getServerLoadScores(),
  ]);

  const geoEnabled = lbSettings.geoRouting !== false;
  const bandwidthAware = lbSettings.bandwidthAware !== false;
  const failoverOnly = lbSettings.failoverOnDegraded !== false;

  let pool = preferHeadroomPool(scores);
  if (!pool.length && failoverOnly) {
    pool = scores.filter((x) => x.server.healthStatus !== "offline");
  }
  if (!pool.length) pool = scores;

  let geo: Awaited<ReturnType<typeof lookupGeo>> | null = null;
  if (clientIp && geoEnabled) {
    // Use Promise.race to avoid blocking on slow geo lookups (max 1s)
    geo = await Promise.race([
      lookupGeo(clientIp),
      new Promise<null>((r) => setTimeout(() => r(null), 1000)),
    ]);
    if (geo) {
      const country = geo.countryCode ?? null;
      const isp = geo.isp ?? null;
      const geoMatched = pool.filter((x) => serverMatchesGeo(x.server, country, isp));
      if (geoMatched.length) pool = geoMatched;
    }
  }

  if (bandwidthAware && requiredBandwidthKbps != null && requiredBandwidthKbps > 0) {
    const needMbps = requiredBandwidthKbps / 1000;
    const withHeadroom = pool.filter((x) => {
      const cap = x.server.bandwidthMbps ?? 1000;
      const used = x.score * cap;
      return cap - used >= needMbps;
    });
    if (withHeadroom.length) pool = withHeadroom;
  }

  if (failoverOnly) {
    pool = pool.filter(
      (x) => !["offline", "degraded"].includes(String(x.server.healthStatus).toLowerCase())
    );
  }

  if (!pool.length) {
    return pickServerForClient(clientIp);
  }

  const sorted = [...pool].sort((a, b) => a.score - b.score);
  return sorted[0]?.server.id ?? null;
}

export async function rankServersForClient(clientIp?: string): Promise<LbServerScore[]> {
  const scores = await getServerLoadScores();
  const geo = clientIp
    ? await Promise.race([
        lookupGeo(clientIp),
        new Promise<null>((r) => setTimeout(() => r(null), 1000)),
      ])
    : null;

  return scores.map((x) => {
    const reasons: string[] = [];
    let score = x.score;
    if (x.online) reasons.push("online");
    else reasons.push("offline");

    if (geo && serverMatchesGeo(x.server, geo.countryCode, geo.isp)) {
      reasons.push("geo-match");
      score -= 0.15;
    }
    if (x.server.healthStatus === "healthy" || x.server.healthStatus === "online") {
      reasons.push("healthy");
      score -= 0.05;
    }
    if (x.saturated) {
      reasons.push("saturated");
      score += 0.45;
    } else if (x.server.bandwidthMbps && x.server.bandwidthMbps > 0) {
      reasons.push(`egress-headroom-${x.headroomPct}%`);
      score -= Math.min(0.2, x.headroomPct / 500);
    }

    return {
      serverId: x.server.id,
      score,
      online: x.online,
      bandwidthMbps: x.server.bandwidthMbps,
      healthStatus: x.server.healthStatus,
      reasons,
    };
  }).sort((a, b) => a.score - b.score);
}
