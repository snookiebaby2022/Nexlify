import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma, StreamType } from "@prisma/client";
import { listActiveConnections } from "@/lib/connections";
import { buildAnalyticsPdf } from "@/lib/analytics-pdf";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const range = req.nextUrl.searchParams.get("range") ?? "24h";
  const hours = range === "7d" ? 168 : range === "30d" ? 720 : 24;
  const staleBefore = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [lines, activeStreams, connections, topChannels, bandwidthSnapshots, geoPoints, vodCounts, archiveStreams, transcodeStreams] =
    await Promise.all([
      prisma.line.count(),
      prisma.stream.count({ where: { isActive: true } }),
      listActiveConnections(),
      prisma.lineChannelWatch.findMany({
        orderBy: { watchCount: "desc" },
        take: 15,
        include: { stream: { select: { name: true, type: true } } },
      }),
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

  const countryCounts = new Map<string, { name: string; count: number }>();
  for (const g of geoPoints) {
    const cc = g.countryCode || "??";
    const existing = countryCounts.get(cc) ?? { name: g.country || cc, count: 0 };
    existing.count++;
    countryCounts.set(cc, existing);
  }
  const geo = [...countryCounts.entries()]
    .map(([, data]) => ({ country: data.name, viewers: data.count }))
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, 20);

  const byType = Object.fromEntries(vodCounts.map((r) => [r.type, r._count.id])) as Record<string, number>;

  const pdf = await buildAnalyticsPdf({
    generatedAt: new Date().toISOString(),
    rangeLabel: range,
    onlineConnections: connections.length,
    lines,
    activeStreams,
    contentCounts: {
      live: byType[StreamType.LIVE] ?? 0,
      movies: byType[StreamType.MOVIE] ?? 0,
      series: byType[StreamType.SERIES] ?? 0,
      archive: archiveStreams,
      transcode: transcodeStreams,
    },
    topChannels: topChannels.map((r) => ({
      name: r.stream?.name ?? r.streamId,
      type: r.stream?.type,
      watchCount: r.watchCount,
    })),
    geo,
    bandwidth: bandwidthSnapshots.map((b) => ({
      time: b.createdAt.toISOString(),
      mbps: Number(b.bytesOut) / 125_000 / 60,
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="analytics-report-${Date.now()}.pdf"`,
    },
  });
}
