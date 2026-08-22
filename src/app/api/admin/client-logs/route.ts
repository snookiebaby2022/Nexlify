import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { PLAYBACK_STALE_MS } from "@/lib/connections";

/** Client connection log — active + recently ended sessions (24h window). */
export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100), 500);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    lastSeenAt: { gte: since },
  };
  if (q) {
    where.OR = [
      { ip: { contains: q, mode: "insensitive" } },
      { userAgent: { contains: q, mode: "insensitive" } },
      { line: { username: { contains: q, mode: "insensitive" } } },
      { stream: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const connections = await prisma.liveConnection.findMany({
    where,
    include: {
      line: { select: { id: true, username: true } },
      stream: { select: { id: true, name: true, type: true } },
    },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
  });

  const now = Date.now();
  return NextResponse.json({
    logs: connections.map((c) => ({
      id: c.id,
      lineId: c.lineId,
      lineUsername: c.line?.username ?? "—",
      streamId: c.streamId,
      streamName: c.stream?.name ?? null,
      streamType: c.stream?.type ?? null,
      ip: c.ip,
      userAgent: c.userAgent,
      startedAt: c.startedAt,
      lastSeenAt: c.lastSeenAt,
      active: now - c.lastSeenAt.getTime() < PLAYBACK_STALE_MS,
    })),
  });
}
