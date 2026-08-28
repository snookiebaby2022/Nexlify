import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { buildServerRoleContext, resolveServerRole } from "@/lib/ensure-main-server-online";
import { isServerHealthOnline } from "@/lib/server-tree";
import {
  estimatedLiveBandwidthMbps,
  viewerSlotsUsed,
} from "@/lib/server-load-metrics";

const STALE_MS = 5 * 60 * 1000;

export async function getServerLoadScores() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const [servers, connRows] = await Promise.all([
    prisma.streamServer.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { streams: true } },
        processes: { where: { status: "running", lastSeenAt: { gte: staleBefore } } },
      },
    }),
    prisma.liveConnection.findMany({
      where: { lastSeenAt: { gte: staleBefore }, stream: { serverId: { not: null } } },
      select: { stream: { select: { serverId: true } } },
    }),
  ]);

  const liveByServer = new Map<string, number>();
  for (const c of connRows) {
    const sid = c.stream?.serverId;
    if (!sid) continue;
    liveByServer.set(sid, (liveByServer.get(sid) ?? 0) + 1);
  }

  return servers.map((s) => {
    const catalogAssigned = s._count.streams;
    const running = s.processes.length;
    const liveConnections = liveByServer.get(s.id) ?? 0;
    const slotsUsed = viewerSlotsUsed(liveConnections, running);
    const slots = s.maxClients > 0 ? s.maxClients : 1000;
    const bitrateSum = s.processes.reduce((acc, p) => acc + (p.bitrateKbps ?? 0), 0);
    return {
      server: s,
      slotsUsed,
      catalogAssigned,
      liveConnections,
      slots,
      score: slotsUsed / slots,
      bandwidthMbps: estimatedLiveBandwidthMbps(liveConnections, bitrateSum),
      online: isServerHealthOnline(s.healthStatus),
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
  if (!online.length) return null;

  if (mode === "round_robin") {
    const sorted = [...online].sort((a, b) => a.server.sortOrder - b.server.sortOrder);
    return sorted[0]?.server.id ?? null;
  }

  const sorted = [...online].sort((a, b) => a.score - b.score);
  return sorted[0]?.server.id ?? null;
}

function isTenGigLbLabel(name: string, host: string): boolean {
  const s = `${name} ${host}`.toLowerCase();
  return /10\s*gbs?\b/.test(s) || /10\s*gbps/.test(s);
}

function roleCtxFromScores(scores: Awaited<ReturnType<typeof getServerLoadScores>>) {
  return buildServerRoleContext(
    scores.map((x) => ({
      id: x.server.id,
      host: x.server.host,
      sortOrder: x.server.sortOrder,
      panelSettings: x.server.panelSettings,
      geoLbCountries: x.server.geoLbCountries,
      geoLbIsps: x.server.geoLbIsps,
      name: x.server.name,
    }))
  );
}

function pickNamedOrLeastLb(
  scores: Awaited<ReturnType<typeof getServerLoadScores>>
): string | null {
  const roleCtx = roleCtxFromScores(scores);
  const lbs = scores.filter((x) => {
    if (!x.online || !x.server.isActive) return false;
    return resolveServerRole(x.server, roleCtx) !== "main";
  });
  if (!lbs.length) return null;
  const named = lbs
    .filter((x) => isTenGigLbLabel(String(x.server.name ?? ""), String(x.server.host ?? "")))
    .sort((a, b) => b.slots - a.slots);
  if (named[0]) return named[0].server.id;
  const sorted = [...lbs].sort((a, b) => a.score - b.score);
  return sorted[0]?.server.id ?? null;
}

/** Prefer an explicit LB; if missing or Main, use the 10Gbps LB. */
export async function resolvePlaybackLoadBalancerId(preferred?: string | null): Promise<string | null> {
  const scores = await getServerLoadScores();
  const roleCtx = roleCtxFromScores(scores);
  const id = preferred?.trim() || "";
  if (id) {
    const hit = scores.find((x) => x.server.id === id);
    if (hit?.server.isActive && resolveServerRole(hit.server, roleCtx) !== "main") {
      return id;
    }
  }
  return pickNamedOrLeastLb(scores);
}

/** Movies/series go to the 10Gbps LB when present; never default onto Main. */
export async function pickVodLoadBalancerId(): Promise<string | null> {
  return resolvePlaybackLoadBalancerId(null);
}

export async function reassignStreamsFromOfflineServers() {
  const offline = await prisma.streamServer.findMany({
    where: {
      OR: [{ isActive: false }, { healthStatus: { in: ["offline", "degraded"] } }],
    },
    select: { id: true },
  });
  if (!offline.length) return 0;

  const targetId = await pickLeastLoadedServerId();
  if (!targetId) return 0;
  if (offline.some((s) => s.id === targetId)) return 0;

  const r = await prisma.stream.updateMany({
    where: {
      serverId: { in: offline.map((s) => s.id) },
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
  includeMain?: boolean;
  /** Skip autoRebalanceLive mode check (manual "Balance now"). */
  force?: boolean;
}): Promise<{ moved: number; servers: number }> {
  const settings = await getSettingGroup("streams");
  const mode = String(settings.autoRebalanceLive ?? "off");
  if (!opts?.force && (mode === "off" || mode === "failover_only")) {
    return { moved: 0, servers: 0 };
  }

  const includeMain =
    opts?.includeMain === true || settings.autoRebalanceIncludeMain === true;

  const scores = await getServerLoadScores();
  const roleCtx = buildServerRoleContext(
    scores.map((x) => ({
      id: x.server.id,
      host: x.server.host,
      sortOrder: x.server.sortOrder,
      panelSettings: x.server.panelSettings,
      geoLbCountries: x.server.geoLbCountries,
      geoLbIsps: x.server.geoLbIsps,
      name: x.server.name,
    }))
  );
  const mainIds = new Set(
    scores
      .filter((x) => resolveServerRole(x.server, roleCtx) === "main")
      .map((x) => x.server.id)
  );
  const online = scores.filter((x) => {
    if (!x.online || !x.server.isActive) return false;
    if (!includeMain && mainIds.has(x.server.id)) return false;
    return true;
  });
  if (online.length < 1) return { moved: 0, servers: 0 };

  const maxMoves = Math.max(1, Math.min(opts?.maxMoves ?? 80, 400));

  // Drain live catalog off the panel/main host onto LB nodes.
  if (!includeMain && mainIds.size && online.length >= 1) {
    const drainMoves: { streamId: string; toServerId: string }[] = [];
    for (const mainId of mainIds) {
      if (drainMoves.length >= maxMoves) break;
      const take = Math.min(maxMoves - drainMoves.length, 400);
      const streams = await prisma.stream.findMany({
        where: { type: "LIVE", isActive: true, serverId: mainId },
        select: { id: true },
        orderBy: { updatedAt: "asc" },
        take,
      });
      let i = 0;
      for (const stream of streams) {
        const dest = online[i % online.length]!;
        drainMoves.push({ streamId: stream.id, toServerId: dest.server.id });
        i++;
      }
    }
    if (drainMoves.length) {
      const byDest = new Map<string, string[]>();
      for (const m of drainMoves) {
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
      return { moved: drainMoves.length, servers: online.length };
    }
  }

  if (online.length < 2) return { moved: 0, servers: online.length };

  const totalLive = online.reduce((n, s) => n + s.catalogAssigned, 0);
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
    .filter((s) => s.catalogAssigned > (targets.get(s.server.id) ?? 0))
    .sort((a, b) => b.catalogAssigned - a.catalogAssigned);
  const receivers = online
    .filter((s) => s.catalogAssigned < (targets.get(s.server.id) ?? 0))
    .sort((a, b) => a.catalogAssigned - b.catalogAssigned);

  if (!donors.length || !receivers.length) return { moved: 0, servers: online.length };

  for (const donor of donors) {
    if (moves.length >= maxMoves) break;
    const targetCount = targets.get(donor.server.id) ?? 0;
    const excess = donor.catalogAssigned - targetCount;
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
        if (recv.catalogAssigned + already >= want) continue;        moves.push({ streamId: stream.id, toServerId: recv.server.id });
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
