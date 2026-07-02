import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const endpoints = await prisma.rtmpEndpoint.findMany({
    orderBy: { createdAt: "desc" },
  });

  const serverCounts = await prisma.streamServer.groupBy({
    by: ["rtmpPort"],
    _count: true,
    where: { rtmpPort: { not: null } },
  });
  const rtmpServerCount = serverCounts.reduce((sum, g) => sum + g._count, 0);

  return NextResponse.json({
    endpoints: endpoints.map((ep) => ({
      id: ep.id,
      name: ep.name,
      host: ep.host,
      port: ep.port,
      appName: ep.appName,
      isActive: ep.isActive,
      notes: ep.notes,
      createdAt: ep.createdAt.toISOString(),
      serverCount: rtmpServerCount,
    })),
  });
}
