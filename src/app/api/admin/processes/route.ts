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

  const processes = await prisma.streamProcess.findMany({
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
}
