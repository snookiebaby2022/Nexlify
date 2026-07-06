import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listActiveConnections } from "@/lib/connections";
import { ownerScope, isPanelAdmin } from "@/lib/owner-scope";
import { PanelRole, Prisma, StreamType } from "@prisma/client";
import { cacheGetOrSet } from "@/lib/cache";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = ownerScope(session);
  const cacheKey = scope ? `analytics:${scope}` : "analytics:all";

  const data = await cacheGetOrSet(cacheKey, 15, async () => {
    const watchWhere = scope ? { line: { ownerId: scope } } : undefined;
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let topChannels: unknown[] = [];
    let connections: unknown[] = [];
    let bandwidthSnapshots: { bytesIn: bigint; bytesOut: bigint; createdAt: Date }[] = [];
    let geoPoints: { countryCode: string; country: string }[] = [];
    try {
      [topChannels, connections, bandwidthSnapshots, geoPoints] = await Promise.all([
        prisma.lineChannelWatch.findMany({
          where: watchWhere,
          orderBy: { watchCount: "desc" },
          take: 15,
          include: { stream: { select: { id: true, name: true, type: true, streamIcon: true } } },
        }),
        listActiveConnections(scope),
        prisma.bandwidthSnapshot.findMany({
          where: { createdAt: { gte: staleBefore } },
          orderBy: { createdAt: "asc" },
          take: 48,
        }),
        prisma.connectionGeography.findMany({
          where: { lastSeenAt: { gte: staleBefore } },
          select: { countryCode: true, country: true },
          take: 5000,
        }),
      ]);
    } catch {
      // Gracefully handle missing tables/columns from stale DB
    }

    const bandwidth = bandwidthSnapshots.map((b) => ({
      time: b.createdAt.toISOString(),
      mbps: Number(b.bytesOut) / 125_000 / 60,
    }));

    const countryCounts = new Map<string, { name: string; count: number }>();
    for (const g of geoPoints) {
      const cc = g.countryCode || "??";
      const existing = countryCounts.get(cc) ?? { name: g.country || cc, count: 0 };
      existing.count++;
      countryCounts.set(cc, existing);
    }
    const geo = [...countryCounts.entries()]
      .map(([code, data]) => ({ country: data.name, viewers: data.count }))
      .sort((a, b) => b.viewers - a.viewers)
      .slice(0, 20);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = {
      onlineConnections: Array.isArray(connections) ? connections.length : 0,
      bandwidth,
      geo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      topChannels: (Array.isArray(topChannels) ? topChannels : []).map((r: any) => ({
        streamId: r.streamId,
        name: r.stream?.name,
        type: r.stream?.type,
        icon: r.stream?.streamIcon,
        watchCount: r.watchCount,
        lastWatchedAt: r.lastWatchedAt,
      })),
    };

    if (!isPanelAdmin(session.role)) {
      return payload;
    }

    try {
      const [vodCounts, archiveStreams, transcodeStreams] = await Promise.all([
        prisma.stream.groupBy({
          by: ["type"],
          _count: { id: true },
          where: { isActive: true },
        }),
        prisma.stream.count({
          where: {
            OR: [{ isShifted: true }, { timeshiftSeconds: { gt: 0 } }, { archiveDays: { gt: 0 } }],
          },
        }),
        prisma.stream.count({
          where: {
            OR: [
              { agentStartCmd: { contains: "transcode", mode: "insensitive" } },
              { bitrates: { not: Prisma.DbNull } },
            ],
          },
        }),
      ]);

      const byType = Object.fromEntries(
        vodCounts.map((r) => [r.type, r._count.id])
      ) as Record<string, number>;

      return {
        ...payload,
        contentCounts: {
          live: byType[StreamType.LIVE] ?? 0,
          movie: byType[StreamType.MOVIE] ?? 0,
          series: byType[StreamType.SERIES] ?? 0,
        },
        timeshiftArchiveStreams: archiveStreams,
        transcodeStreams,
      };
    } catch {
      return payload;
    }
  });

  return NextResponse.json(data);
}
