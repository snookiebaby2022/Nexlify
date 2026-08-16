import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/owner-scope";
import { PanelRole } from "@prisma/client";
import { cacheGetOrSet } from "@/lib/cache";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;
const MAP_CACHE_TTL = 10; // 10 seconds

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = ownerScope(session);
  const cacheKey = scope ? `connmap:${scope}` : "connmap:all";

  const data = await cacheGetOrSet(cacheKey, MAP_CACHE_TTL, async () => {
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000); // Match connection tracking 24h window

    // Use LiveConnection for real-time count and per-country aggregation
    const { listLiveConnections } = await import("@/lib/connections");
    const activeConns = await listLiveConnections(scope);
    const total = activeConns.length;

    // Cleanup stale ConnectionGeography rows
    await prisma.connectionGeography.deleteMany({
      where: { lastSeenAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
    });

    // Use ConnectionGeography for map points only (geo data for visualization)
    const geoPoints = await prisma.connectionGeography.findMany({
      where: {
        lastSeenAt: { gte: staleBefore },
        ...(scope ? { line: { ownerId: scope } } : {}),
      },
      orderBy: { lastSeenAt: "desc" },
      take: 5000,
    });

    // Build per-country counts from active connections, not accumulated connectionCount
    const countryCounts = new Map<string, number>();
    for (const conn of activeConns) {
      const geo = geoPoints.find(
        (g) => g.lineId === conn.lineId && g.streamId === (conn as Record<string, unknown>).streamId
      );
      const cc = geo?.countryCode || "??";
      countryCounts.set(cc, (countryCounts.get(cc) ?? 0) + 1);
    }

    // Also count from geo points for connections that may have ended but still have geo data
    for (const g of geoPoints) {
      const cc = g.countryCode || "??";
      if (!countryCounts.has(cc)) {
        countryCounts.set(cc, 0);
      }
    }

    // Aggregate by country for the map
    const byCountry = new Map<string, { countryCode: string; countryName: string; count: number; mapX: number; mapY: number }>();
    for (const g of geoPoints) {
      const cc = g.countryCode || "??";
      if (byCountry.has(cc)) continue;
      byCountry.set(cc, {
        countryCode: cc,
        countryName: g.country,
        count: countryCounts.get(cc) ?? 0,
        mapX: g.lng ? Math.max(0, Math.min(100, ((g.lng + 180) / 360) * 100)) : 50,
        mapY: g.lat ? Math.max(0, Math.min(100, ((90 - g.lat) / 180) * 100)) : 40,
      });
    }

    // Build points array from geo data, deduplicated by IP+stream
    const seenPoints = new Set<string>();
    const points = geoPoints
      .filter((g) => {
        const key = `${g.city || ""}:${g.streamId || ""}`;
        if (seenPoints.has(key)) return false;
        seenPoints.add(key);
        return true;
      })
      .map((g) => ({
        id: g.id,
        ip: g.city || "",
        countryCode: g.countryCode,
        countryName: g.country,
        mapX: g.lng ? Math.max(0, Math.min(100, ((g.lng + 180) / 360) * 100)) : 50,
        mapY: g.lat ? Math.max(0, Math.min(100, ((90 - g.lat) / 180) * 100)) : 40,
        line: g.lineId || "",
        stream: g.streamId || null,
      }));

    return {
      total,
      countries: Array.from(byCountry.values()).sort((a, b) => b.count - a.count),
      points,
    };
  });

  return NextResponse.json(data);
}
