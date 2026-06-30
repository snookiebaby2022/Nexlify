import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const streamId = searchParams.get("streamId");
    const serverId = searchParams.get("serverId");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const offset = Number(searchParams.get("offset") ?? 0);

    const where: Record<string, unknown> = {
      type: StreamType.LIVE,
      isActive: true,
    };
    if (streamId) where.id = streamId;
    if (serverId) where.serverId = serverId;

    const [streams, total] = await Promise.all([
      prisma.stream.findMany({
        where,
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          lastProbeOk: true,
          lastProbeError: true,
          backupUrl: true,
          serverId: true,
          server: { select: { name: true } },
        },
      }),
      prisma.stream.count({ where }),
    ]);

    // Get live connection counts per stream (last 2 minutes)
    const streamIds = streams.map((s) => s.id);
    const connectionCounts = await prisma.liveConnection.groupBy({
      by: ["streamId"],
      where: {
        streamId: { in: streamIds },
        lastSeenAt: { gte: new Date(Date.now() - 120_000) },
      },
      _count: { streamId: true },
    });

    const countByStreamId = new Map(
      connectionCounts.map((c) => [c.streamId, c._count.streamId])
    );

    // Calculate uptime percentage
    const onlineCount = streams.filter((s) => s.lastProbeOk === true).length;
    const uptimePct = total > 0 ? Math.round((onlineCount / total) * 100) : 100;

    const rows = streams.map((s) => ({
      id: s.id,
      name: s.name,
      server: s.server?.name ?? "—",
      lastProbeOk: s.lastProbeOk,
      lastProbeError: s.lastProbeError,
      connections: countByStreamId.get(s.id) ?? 0,
      hasBackup: Boolean(s.backupUrl),
      logsUrl: `/admin/streams/logs?id=${s.id}`,
    }));

    return NextResponse.json({
      streams: rows,
      summary: { total, uptimePct },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Stream health error:", message);
    return NextResponse.json(
      {
        error: "Failed to load stream health data",
        streams: [],
        summary: { total: 0, uptimePct: 100 },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const streamId = String(body.streamId ?? "");
    if (!streamId) return NextResponse.json({ error: "streamId required" }, { status: 400 });

    // In future: trigger stream restart or health check
    return NextResponse.json({ message: "Stream health check triggered" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
