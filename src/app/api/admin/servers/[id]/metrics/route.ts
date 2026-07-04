import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import os from "os";

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }
  return Math.round(((totalTick - totalIdle) / totalTick) * 100);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const server = await prisma.streamServer.findUnique({
    where: { id },
    select: { host: true, port: true, agentLastSeen: true, isActive: true },
  });

  const hb = server?.agentLastSeen ? new Date(server.agentLastSeen).getTime() : 0;
  const agentOnline = server?.isActive && hb > 0 && Date.now() - hb < 120_000;

  // For local/monolithic server, get real system metrics
  const isLocal = !server?.host || server.host === "127.0.0.1" || server.host === "localhost" || server.host === "::1";

  if (isLocal || !agentOnline) {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const data = {
      serverId: id,
      timestamp: Date.now(),
      cpu: getCpuUsage(),
      ram: Math.round((usedMem / totalMem) * 100),
      disk: 0, // Requires platform-specific command
      networkIn: 0, // Requires platform-specific command
      networkOut: 0,
      connections: 0,
      agentOnline: Boolean(agentOnline),
    };
    return NextResponse.json(data);
  }

  // For remote servers with agent, return basic info
  const data = {
    serverId: id,
    timestamp: Date.now(),
    cpu: 0,
    ram: 0,
    disk: 0,
    networkIn: 0,
    networkOut: 0,
    connections: 0,
    agentOnline: true,
  };
  return NextResponse.json(data);
}
