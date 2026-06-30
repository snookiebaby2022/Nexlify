import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";

const STALE_MS = 5 * 60 * 1000;

export async function getServerLoadScores() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { streams: true } },
      processes: { where: { status: "running", lastSeenAt: { gte: staleBefore } } },
    },
  });

  return servers.map((s) => {
    const streamCount = s._count.streams;
    const running = s.processes.length;
    const slotsUsed = Math.max(streamCount, running);
    const slots = s.maxClients > 0 ? s.maxClients : 1000;
    return {
      server: s,
      slotsUsed,
      slots,
      score: slotsUsed / slots,
      online: s.healthStatus === "online" || s.healthStatus === "healthy",
    };
  });
}

export async function pickLeastLoadedServerId(clientIp?: string): Promise<string | null> {
  if (clientIp) {
    const { pickServerForClient } = await import("@/lib/server-geo-lb");
    const geoPick = await pickServerForClient(clientIp);
    if (geoPick) return geoPick;
  }
  const settings = await getSettingGroup("streams");
  const mode = String(settings.loadBalancing ?? "server_slots");
  const scores = await getServerLoadScores();
  const online = scores.filter((x) => x.online);
  const pool = online.length ? online : scores;
  if (!pool.length) return null;

  if (mode === "round_robin") {
    const sorted = [...pool].sort((a, b) => a.server.sortOrder - b.server.sortOrder);
    return sorted[0]?.server.id ?? null;
  }

  const sorted = [...pool].sort((a, b) => a.score - b.score);
  return sorted[0]?.server.id ?? null;
}

export async function reassignStreamsFromOfflineServers() {
  const offline = await prisma.streamServer.findMany({
    where: {
      isActive: true,
      healthStatus: { in: ["offline", "degraded"] },
    },
    select: { id: true },
  });
  if (!offline.length) return 0;

  const targetId = await pickLeastLoadedServerId();
  if (!targetId) return 0;

  const r = await prisma.stream.updateMany({
    where: {
      serverId: { in: offline.map((s) => s.id) },
      type: "LIVE",
    },
    data: { serverId: targetId },
  });
  return r.count;
}
