import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  try {
    const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const since = new Date(Date.now() - 30 * 86400000);
  const ownerFilter =
    session.role === "RESELLER" || session.role === "SUB_RESELLER"
      ? { ownerId: session.id }
      : {};

  const lines = await prisma.line.findMany({
    where: ownerFilter,
    select: {
      id: true,
      username: true,
      status: true,
      expiresAt: true,
      maxConnections: true,
      _count: { select: { liveConnections: true, channelWatches: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const activeConnections = await prisma.liveConnection.count({
    where: { lastSeenAt: { gte: new Date(Date.now() - 120_000) }, line: ownerFilter },
  });

  const bandwidth = await prisma.bandwidthSnapshot.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const topWatched = await prisma.lineChannelWatch.groupBy({
    by: ["streamId"],
    _sum: { watchCount: true },
    orderBy: { _sum: { watchCount: "desc" } },
    take: 10,
  });

  const streamNames = await prisma.stream.findMany({
    where: { id: { in: topWatched.map((t) => t.streamId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(streamNames.map((s) => [s.id, s.name]));

  return NextResponse.json({
    summary: {
      totalLines: lines.length,
      activeConnections,
      expiredLines: lines.filter((l) => l.status === "EXPIRED").length,
    },
    lines: lines.map((l) => ({
      username: l.username,
      status: l.status,
      expiresAt: l.expiresAt,
      maxConnections: l.maxConnections,
      watches: l._count.channelWatches,
    })),
    bandwidth,
    topChannels: topWatched.map((t) => ({
      streamId: t.streamId,
      name: nameById.get(t.streamId) ?? t.streamId,
      watchCount: t._sum.watchCount ?? 0,
    })),
  });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Usage reports error:", message);
    return NextResponse.json(
      { error: "Failed to load usage reports", summary: { totalLines: 0, activeConnections: 0, expiredLines: 0 }, lines: [], topChannels: [] },
      { status: 500 }
    );
  }
}
