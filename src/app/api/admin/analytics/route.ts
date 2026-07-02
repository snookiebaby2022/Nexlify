import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listActiveConnections } from "@/lib/connections";
import { ownerScope, isPanelAdmin } from "@/lib/owner-scope";
import { PanelRole, Prisma, StreamType } from "@prisma/client";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = ownerScope(session);
  const watchWhere = scope ? { line: { ownerId: scope } } : undefined;

  let topChannels: unknown[] = [];
  let connections: unknown[] = [];
  try {
    [topChannels, connections] = await Promise.all([
      prisma.lineChannelWatch.findMany({
        where: watchWhere,
        orderBy: { watchCount: "desc" },
        take: 15,
        include: { stream: { select: { id: true, name: true, type: true, streamIcon: true } } },
      }),
      listActiveConnections(scope),
    ]);
  } catch {
    // Gracefully handle missing tables/columns from stale DB
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = {
    onlineConnections: Array.isArray(connections) ? connections.length : 0,
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
    return NextResponse.json(payload);
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

    return NextResponse.json({
      ...payload,
      contentCounts: {
        live: byType[StreamType.LIVE] ?? 0,
        movie: byType[StreamType.MOVIE] ?? 0,
        series: byType[StreamType.SERIES] ?? 0,
      },
      timeshiftArchiveStreams: archiveStreams,
      transcodeStreams,
    });
  } catch {
    return NextResponse.json(payload);
  }
}
