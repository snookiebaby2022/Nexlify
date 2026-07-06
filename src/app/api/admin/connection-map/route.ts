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
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);

    // Use LiveConnection for real-time count (not accumulated ConnectionGeography)
    const { listActiveConnections } = await import("@/lib/connections");
    const activeConns = await listActiveConnections(scope);
    const total = activeConns.length;

    // Use ConnectionGeography for map points only (geo data for visualization)
    const geoPoints = await prisma.connectionGeography.findMany({
      where: {
        lastSeenAt: { gte: staleBefore },
        ...(scope ? { line: { ownerId: scope } } : {}),
      },
      orderBy: { lastSeenAt: "desc" },
      take: 5000,
    });

    // Aggregate by country using LiveConnection data when available, fallback to geo
    const byCountry = new Map<string, { countryCode: string; countryName: string; count: number; mapX: number; mapY: number }>();
    for (const g of geoPoints) {
      const cc = g.countryCode || "??";
      const existing = byCountry.get(cc);
      if (existing) {
        existing.count += g.connectionCount;
      } else {
        byCountry.set(cc, {
          countryCode: cc,
          countryName: g.country,
          count: g.connectionCount,
          mapX: g.lng ? Math.max(0, Math.min(100, ((g.lng + 180) / 360) * 100)) : 50,
          mapY: g.lat ? Math.max(0, Math.min(100, ((90 - g.lat) / 180) * 100)) : 40,
        });
      }
    }

    // Build points array from geo data
    const points = geoPoints.map((g) => ({
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
