import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [processes, activity, liveViews, relayErrorsRaw] = await Promise.all([
    prisma.streamProcess.findMany({
      where: { lastSeenAt: { gte: staleBefore } },
      include: {
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: staleBefore },
        OR: [{ entity: "stream" }, { action: { contains: "stream" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.liveConnection.findMany({
      where: { lastSeenAt: { gte: staleBefore }, streamId: { not: null } },
      include: {
        stream: { select: { id: true, name: true } },
        line: { select: { username: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: staleBefore },
        action: "stream_hls_relay_error",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const relayStreamIds = [
    ...new Set(
      relayErrorsRaw
        .map((r) => r.entityId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const relayStreams =
    relayStreamIds.length > 0
      ? await prisma.stream.findMany({
          where: { id: { in: relayStreamIds } },
          select: { id: true, name: true },
        })
      : [];
  const relayNameById = new Map(relayStreams.map((s) => [s.id, s.name]));
  const relayErrors = relayErrorsRaw.map((r) => ({
    ...r,
    streamName: r.entityId ? relayNameById.get(r.entityId) ?? null : null,
  }));

  return NextResponse.json({ processes, activity, liveViews, relayErrors });
}
