import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/owner-scope";
import { PanelRole } from "@prisma/client";
import { cacheGetOrSet } from "@/lib/cache";
import { countryMapPosition, latLngToMapPct, stableCountryOffset } from "@/lib/connection-map-geo";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;
const MAP_CACHE_TTL = 30;

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = ownerScope(session);
  const cacheKey = scope ? `connmap:${scope}` : "connmap:all";

  const data = await cacheGetOrSet(cacheKey, MAP_CACHE_TTL, async () => {
    const { listLiveConnections } = await import("@/lib/connections");
    const { lookupGeo } = await import("@/lib/geoip");
    const activeConns = await listLiveConnections(scope);
    const total = activeConns.length;
    const lineIds = [...new Set(activeConns.map((c) => c.lineId))];

    const geoRows = lineIds.length
      ? await prisma.connectionGeography.findMany({
          where: {
            lineId: { in: lineIds },
            lastSeenAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
            ...(scope ? { line: { ownerId: scope } } : {}),
          },
          orderBy: { lastSeenAt: "desc" },
          take: 8000,
        })
      : [];

    const geoByLineStream = new Map<string, (typeof geoRows)[number]>();
    const geoByLine = new Map<string, (typeof geoRows)[number]>();
    for (const g of geoRows) {
      const ls = `${g.lineId}:${g.streamId ?? ""}`;
      if (!geoByLineStream.has(ls)) geoByLineStream.set(ls, g);
      if (g.lineId && !geoByLine.has(g.lineId)) geoByLine.set(g.lineId, g);
    }

    const countryCounts = new Map<string, { name: string; count: number; mapX: number; mapY: number }>();
    const points: {
      id: string;
      mapX: number;
      mapY: number;
      line: string;
      stream: string | null;
      countryCode: string | null;
    }[] = [];

    for (const conn of activeConns) {
      const lineLabel = conn.line?.username ?? conn.lineId;
      const streamName = conn.stream?.name ?? conn.streamId ?? null;
      const geo =
        geoByLineStream.get(`${conn.lineId}:${conn.streamId ?? ""}`) ??
        geoByLine.get(conn.lineId);

      let countryCode = geo?.countryCode || null;
      let countryName = geo?.country || "Unknown";

      if (!countryCode && conn.ip) {
        const looked = await lookupGeo(conn.ip);
        countryCode = looked?.countryCode ?? null;
        countryName = looked?.countryName ?? countryName;
      }

      const cc = countryCode || "??";
      const centroid = countryMapPosition(countryCode);
      const geoPct =
        geo?.lat != null && geo?.lng != null ? latLngToMapPct(geo.lat, geo.lng) : null;
      const base = centroid ?? geoPct ?? ([50, 40] as [number, number]);
      const bucket = countryCounts.get(cc) ?? { name: countryName, count: 0, mapX: base[0], mapY: base[1] };
      const [dx, dy] = stableCountryOffset(conn.id, bucket.count);
      bucket.count += 1;
      countryCounts.set(cc, bucket);

      points.push({
        id: conn.id,
        mapX: Math.max(0, Math.min(100, base[0] + dx)),
        mapY: Math.max(0, Math.min(100, base[1] + dy)),
        line: lineLabel,
        stream: streamName,
        countryCode: cc,
      });
    }

    const countries = [...countryCounts.entries()]
      .map(([countryCode, v]) => ({
        countryCode,
        countryName: v.name,
        count: v.count,
        mapX: v.mapX,
        mapY: v.mapY,
      }))
      .sort((a, b) => b.count - a.count);

    return { total, countries, points };
  });

  return NextResponse.json(data);
}
