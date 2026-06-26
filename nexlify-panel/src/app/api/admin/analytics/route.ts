import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listActiveConnections } from "@/lib/connections";
import { PanelRole, Prisma, StreamType } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [topChannels, connections, vodCounts, archiveStreams, transcodeStreams] =
    await Promise.all([
      prisma.lineChannelWatch.findMany({
        orderBy: { watchCount: "desc" },
        take: 15,
        include: { stream: { select: { id: true, name: true, type: true, streamIcon: true } } },
      }),
      listActiveConnections(),
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
    onlineConnections: connections.length,
    topChannels: topChannels.map((r) => ({
      streamId: r.streamId,
      name: r.stream.name,
      type: r.stream.type,
      icon: r.stream.streamIcon,
      watchCount: r.watchCount,
      lastWatchedAt: r.lastWatchedAt,
    })),
    contentCounts: {
      live: byType[StreamType.LIVE] ?? 0,
      movie: byType[StreamType.MOVIE] ?? 0,
      series: byType[StreamType.SERIES] ?? 0,
    },
    timeshiftArchiveStreams: archiveStreams,
    transcodeStreams,
  });
}
