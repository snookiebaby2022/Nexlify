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

/**
 * Evenly spread LIVE streams across online load-balancer servers to reduce
 * per-box bandwidth, RAM, and CPU. Caps moves per tick to avoid churn.
 */
export async function rebalanceLiveStreamsAcrossServers(opts?: {
  maxMoves?: number;
}): Promise<{ moved: number; servers: number }> {
  const settings = await getSettingGroup("streams");
  const mode = String(settings.autoRebalanceLive ?? settings.loadBalancing ?? "server_slots");
  // off | failover_only → skip even spread (failover handled separately)
  if (mode === "off" || mode === "failover_only") {
    return { moved: 0, servers: 0 };
  }

  const scores = await getServerLoadScores();
  const online = scores.filter((x) => x.online && x.server.isActive);
  if (online.length < 2) return { moved: 0, servers: online.length };

  const maxMoves = Math.max(1, Math.min(opts?.maxMoves ?? 80, 400));
  const totalLive = online.reduce((n, s) => n + s.slotsUsed, 0);
  if (totalLive === 0) return { moved: 0, servers: online.length };

  // Target proportional to capacity (maxClients)
  const totalSlots = online.reduce((n, s) => n + s.slots, 0) || online.length;
  const targets = new Map(
    online.map((s) => [
      s.server.id,
      Math.max(0, Math.round((totalLive * s.slots) / totalSlots)),
    ])
  );

  type Move = { streamId: string; toServerId: string };
  const moves: Move[] = [];

  // Donors = over target; receivers = under target
  const donors = online
    .filter((s) => s.slotsUsed > (targets.get(s.server.id) ?? 0))
    .sort((a, b) => b.slotsUsed - a.slotsUsed);
  const receivers = online
    .filter((s) => s.slotsUsed < (targets.get(s.server.id) ?? 0))
    .sort((a, b) => a.slotsUsed - b.slotsUsed);

  if (!donors.length || !receivers.length) return { moved: 0, servers: online.length };

  for (const donor of donors) {
    if (moves.length >= maxMoves) break;
    const targetCount = targets.get(donor.server.id) ?? 0;
    const excess = donor.slotsUsed - targetCount;
    if (excess <= 0) continue;

    const take = Math.min(excess, maxMoves - moves.length, 40);
    const streams = await prisma.stream.findMany({
      where: {
        type: "LIVE",
        isActive: true,
        serverId: donor.server.id,
      },
      select: { id: true },
      orderBy: { updatedAt: "asc" },
      take,
    });

    let i = 0;
    for (const stream of streams) {
      if (moves.length >= maxMoves) break;
      // Round-robin receivers that still need capacity
      let placed = false;
      for (let r = 0; r < receivers.length; r++) {
        const recv = receivers[(i + r) % receivers.length]!;
        const want = targets.get(recv.server.id) ?? 0;
        const already = moves.filter((m) => m.toServerId === recv.server.id).length;
        if (recv.slotsUsed + already >= want) continue;
        moves.push({ streamId: stream.id, toServerId: recv.server.id });
        placed = true;
        i++;
        break;
      }
      if (!placed) break;
    }
  }

  if (!moves.length) return { moved: 0, servers: online.length };

  // Group by destination for fewer queries
  const byDest = new Map<string, string[]>();
  for (const m of moves) {
    const list = byDest.get(m.toServerId) ?? [];
    list.push(m.streamId);
    byDest.set(m.toServerId, list);
  }
  for (const [serverId, ids] of byDest) {
    await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { serverId },
    });
  }

  return { moved: moves.length, servers: online.length };
}
