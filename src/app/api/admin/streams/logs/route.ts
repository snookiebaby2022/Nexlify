import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { parseLogLimit } from "@/lib/log-page";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = parseLogLimit(req.nextUrl.searchParams.get("limit"));
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [processes, activity, liveViews, relayErrorsRaw, playbackEventsRaw] = await Promise.all([
    prisma.streamProcess.findMany({
      where: { lastSeenAt: { gte: staleBefore } },
      include: {
        stream: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take,
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: staleBefore },
        OR: [{ entity: "stream" }, { action: { contains: "stream" } }],
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.liveConnection.findMany({
      where: { lastSeenAt: { gte: staleBefore }, streamId: { not: null } },
      include: {
        stream: { select: { id: true, name: true } },
        line: { select: { username: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take,
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: staleBefore },
        action: "stream_hls_relay_error",
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: staleBefore },
        action: { startsWith: "playback_" },
      },
      orderBy: { createdAt: "desc" },
      take,
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

  const playbackIds = [
    ...new Set(
      playbackEventsRaw
        .map((r) => r.entityId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const playbackStreams =
    playbackIds.length > 0
      ? await prisma.stream.findMany({
          where: { id: { in: playbackIds } },
          select: { id: true, name: true },
        })
      : [];
  const playbackNameById = new Map(playbackStreams.map((s) => [s.id, s.name]));
  const playbackEvents = playbackEventsRaw.map((r) => ({
    ...r,
    streamName:
      (typeof r.meta === "object" && r.meta && "name" in r.meta
        ? String((r.meta as { name?: string }).name ?? "")
        : "") || (r.entityId ? playbackNameById.get(r.entityId) ?? null : null),
  }));

  return NextResponse.json({ processes, activity, liveViews, relayErrors, playbackEvents });
}

export async function DELETE() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { entity: "stream" },
        { action: { contains: "stream" } },
        { action: { startsWith: "playback_" } },
      ],
    },
  });
  return NextResponse.json({ ok: true, deleted: result.count });
}
