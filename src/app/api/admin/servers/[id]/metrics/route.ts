import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { detectServerHardware, sampleCpuPercent } from "@/lib/server-hardware";
import os from "os";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const server = await prisma.streamServer.findUnique({
      where: { id },
      select: { host: true, port: true, agentLastSeen: true, isActive: true },
    });

    const hb = server?.agentLastSeen ? new Date(server.agentLastSeen).getTime() : 0;
    const agentOnline = Boolean(server?.isActive && hb > 0 && Date.now() - hb < 120_000);
    const hw = detectServerHardware();
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();

    return NextResponse.json({
      serverId: id,
      timestamp: Date.now(),
      cpu: sampleCpuPercent(),
      ram: Math.round((usedMem / totalMem) * 100),
      disk: hw.diskUsedPercent,
      cpuThreads: hw.cpuThreads,
      networkIn: 0,
      networkOut: 0,
      connections: 0,
      agentOnline,
      host: server?.host ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Metrics unavailable", cpu: 0, ram: 0, disk: 0 },
      { status: 200 }
    );
  }
}
