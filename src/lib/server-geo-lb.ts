import type { StreamServer } from "@prisma/client";
import { lookupGeo } from "@/lib/geoip";
import { getServerLoadScores } from "@/lib/server-load";
import { getSettingGroup } from "@/lib/panel-settings";

function parseJsonStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}

export function serverMatchesGeo(
  server: Pick<StreamServer, "geoLbCountries" | "geoLbIsps" | "region">,
  countryCode: string | null,
  isp: string | null
): boolean {
  const countries = parseJsonStringList(server.geoLbCountries);
  const isps = parseJsonStringList(server.geoLbIsps);
  if (!countries.length && !isps.length) return true;

  if (countries.length && countryCode) {
    const cc = countryCode.toUpperCase();
    if (countries.includes(cc)) return true;
    if (server.region && countries.includes(String(server.region).toUpperCase())) return true;
  }

  if (isps.length && isp) {
    const ispLower = isp.toLowerCase();
    for (const needle of isps) {
      if (ispLower.includes(needle.toLowerCase())) return true;
    }
  }

  return !countries.length && !isps.length;
}

/** Pick least-loaded server matching client geo (falls back to global pool). */
export async function pickServerForClient(clientIp?: string): Promise<string | null> {
  const [settings, scores] = await Promise.all([
    getSettingGroup("streams"),
    getServerLoadScores(),
  ]);
  const geoEnabled = settings.geoLoadBalancing !== false;
  const mode = String(settings.loadBalancing ?? "server_slots");

  const online = scores.filter((x) => x.online);
  let pool = online.length ? online : scores;
  if (!pool.length) return null;

  if (geoEnabled && clientIp) {
    const geo = await lookupGeo(clientIp);
    const geoMatched = pool.filter((x) =>
      serverMatchesGeo(x.server, geo?.countryCode ?? null, geo?.isp ?? null)
    );
    if (geoMatched.length) pool = geoMatched;
  }

  if (mode === "round_robin") {
    const sorted = [...pool].sort((a, b) => a.server.sortOrder - b.server.sortOrder);
    return sorted[0]?.server.id ?? null;
  }

  const sorted = [...pool].sort((a, b) => a.score - b.score);
  return sorted[0]?.server.id ?? null;
}
