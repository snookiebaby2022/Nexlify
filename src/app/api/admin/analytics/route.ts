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

  const [topChannels, connections] = await Promise.all([
    prisma.lineChannelWatch.findMany({
      where: watchWhere,
      orderBy: { watchCount: "desc" },
      take: 15,
      include: { stream: { select: { id: true, name: true, type: true, streamIcon: true } } },
    }),
    listActiveConnections(scope),
  ]);

  const payload = {
    onlineConnections: connections.length,
    topChannels: topChannels.map((r) => ({
      streamId: r.streamId,
      name: r.stream.name,
      type: r.stream.type,
      icon: r.stream.streamIcon,
      watchCount: r.watchCount,
      lastWatchedAt: r.lastWatchedAt,
    })),
  };

  if (!isPanelAdmin(session.role)) {
    return NextResponse.json(payload);
  }

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
}
