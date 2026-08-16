import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 200), 500);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { ip: { contains: q, mode: "insensitive" } },
      { fingerprint: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
    ];
  }

  const logs = await prisma.leakAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const lineIds = [...new Set(logs.map((l) => l.lineId).filter(Boolean))] as string[];
  const streamIds = [...new Set(logs.map((l) => l.streamId).filter(Boolean))] as string[];
  const [lines, streams] = await Promise.all([
    lineIds.length
      ? prisma.line.findMany({ where: { id: { in: lineIds } }, select: { id: true, username: true } })
      : Promise.resolve([] as { id: string; username: string }[]),
    streamIds.length
      ? prisma.stream.findMany({ where: { id: { in: streamIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const lineName = new Map(lines.map((l) => [l.id, l.username]));
  const streamName = new Map(streams.map((s) => [s.id, s.name]));

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      lineId: l.lineId,
      streamId: l.streamId,
      ip: l.ip,
      userAgent: l.userAgent,
      fingerprint: l.fingerprint,
      action: l.action,
      meta: l.meta,
      createdAt: l.createdAt,
      lineUsername: l.lineId ? lineName.get(l.lineId) ?? null : null,
      streamName: l.streamId ? streamName.get(l.streamId) ?? null : null,
    })),
  });
}
