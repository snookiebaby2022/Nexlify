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
    include: {
      line: { select: { username: true } },
      stream: { select: { name: true } },
    },
  });

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
      lineUsername: l.line?.username ?? null,
      streamName: l.stream?.name ?? null,
    })),
  });
}
