import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { LIVE_STALE_MS } from "@/lib/connections";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import {
  persistHostMetrics,
  readStoredHostMetrics,
  sampleLocalHostMetrics,
} from "@/lib/host-metrics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const server = await prisma.streamServer.findUnique({
      where: { id },
      select: {
        host: true,
        domain: true,
        port: true,
        agentLastSeen: true,
        isActive: true,
        healthStatus: true,
        panelSettings: true,
        bandwidthMbps: true,
      },
    });

    const hb = server?.agentLastSeen ? new Date(server.agentLastSeen).getTime() : 0;
    const agentOnline = Boolean(server?.isActive && hb > 0 && Date.now() - hb < 120_000);

    const liveBefore = new Date(Date.now() - LIVE_STALE_MS);
    const connections = server
      ? await prisma.liveConnection.count({
          where: { lastSeenAt: { gte: liveBefore }, stream: { serverId: id } },
        })
      : 0;

    const local = server ? isThisPanelMachine(server) : false;
    const stored = server ? readStoredHostMetrics(server.panelSettings) : null;
    const sample = local
      ? sampleLocalHostMetrics(server?.bandwidthMbps ?? 1000)
      : stored;

    if (local && sample) {
      await persistHostMetrics(id, sample).catch(() => {});
    }

    return NextResponse.json({
      serverId: id,
      timestamp: Date.now(),
      cpu: sample?.cpu ?? 0,
      ram: sample?.memory ?? 0,
      disk: sample?.storage ?? 0,
      networkIn: sample?.download ?? 0,
      networkOut: sample?.upload ?? 0,
      networkInMbps: sample?.downloadMbps ?? 0,
      networkOutMbps: sample?.uploadMbps ?? 0,
      connections,
      agentOnline,
      host: server?.host ?? null,
      source: local ? "local" : stored ? "agent" : "none",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Metrics unavailable", cpu: 0, ram: 0, disk: 0 },
      { status: 200 }
    );
  }
}
