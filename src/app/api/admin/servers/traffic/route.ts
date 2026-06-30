import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

const STALE_MS = 5 * 60 * 1000;

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN, PanelRole.RESELLER]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const staleBefore = new Date(Date.now() - STALE_MS);
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    include: {
      streams: { select: { id: true } },
      processes: { where: { status: "running", lastSeenAt: { gte: staleBefore } } },
    },
    orderBy: { name: "asc" },
  });

  const connRows = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { gte: staleBefore }, stream: { serverId: { not: null } } },
    select: { stream: { select: { serverId: true } } },
  });

  const connByServer = new Map<string, number>();
  for (const c of connRows) {
    const sid = c.stream?.serverId;
    if (!sid) continue;
    connByServer.set(sid, (connByServer.get(sid) ?? 0) + 1);
  }

  const data = servers.map((s) => {
    const connections = connByServer.get(s.id) ?? 0;
    const bitrateSum = s.processes.reduce((acc, p) => acc + (p.bitrateKbps ?? 0), 0);
    const bandwidthMbps = bitrateSum > 0 ? Math.round((bitrateSum / 1000) * 10) / 10 : connections * 2.5;
    return {
      id: s.id,
      name: s.name,
      host: s.host,
      connections,
      bandwidthMbps,
      maxCapacity: s.maxClients,
      healthStatus: s.healthStatus,
      streamCount: s.streams.length,
      runningProcesses: s.processes.length,
    };
  });

  return NextResponse.json({ servers: data });
}
