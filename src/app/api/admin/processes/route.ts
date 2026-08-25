import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const processes = await prisma.streamProcess.findMany({
      where: {
        lastSeenAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        status: { in: ["running", "restarting", "unknown"] },
      },
      include: {
        server: { select: { id: true, name: true, host: true, agentLastSeen: true } },
        stream: { select: { id: true, name: true, streamUrl: true, autoRestart: true } },
      },
      orderBy: [{ serverId: "asc" }, { name: "asc" }],
    });

    const staleMs = 120_000;
    const now = Date.now();
    const rows = processes.map((p) => ({
      ...p,
      stale: now - p.lastSeenAt.getTime() > staleMs,
    }));

    return NextResponse.json({ processes: rows });
  } catch (e) {
    return NextResponse.json({
      processes: [],
      error: e instanceof Error ? e.message : "Process list unavailable",
    });
  }
}
