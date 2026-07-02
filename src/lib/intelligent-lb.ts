import { getServerLoadScores } from "@/lib/server-load";
import { pickServerForClient, serverMatchesGeo } from "@/lib/server-geo-lb";
import { lookupGeo } from "@/lib/geoip";
import { getSettingGroup } from "@/lib/panel-settings";
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

  let pool = scores.filter((x) => x.online);
  if (!pool.length && failoverOnly) {
    pool = scores.filter((x) => x.server.healthStatus !== "offline");
  }
  if (!pool.length) pool = scores;

  let geo: Awaited<ReturnType<typeof lookupGeo>> | null = null;
  if (clientIp && geoEnabled) {
    geo = await lookupGeo(clientIp);
    const geoMatched = pool.filter((x) =>
      serverMatchesGeo(x.server, geo?.countryCode ?? null, geo?.isp ?? null)
    );
    if (geoMatched.length) pool = geoMatched;
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
  const geo = clientIp ? await lookupGeo(clientIp) : null;

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
    if (x.server.bandwidthMbps && x.server.bandwidthMbps > 0) {
      const headroom = 1 - x.score;
      reasons.push(`bw-headroom-${Math.round(headroom * 100)}%`);
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
