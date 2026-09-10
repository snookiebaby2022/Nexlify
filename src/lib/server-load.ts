import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { buildServerRoleContext, resolveServerRole } from "@/lib/ensure-main-server-online";
import { isServerHealthOnline } from "@/lib/server-tree";
import {
  estimatedLiveBandwidthMbps,
  preferHeadroomPool,
  serverEgressHeadroom,
  viewerSlotsUsed,
} from "@/lib/server-load-metrics";
import {
  normalizeServerPool,
  parseStoredServerPool,
  poolAllowsServer,
  rotatePoolPrimary,
} from "@/lib/server-pool";

const STALE_MS = 5 * 60 * 1000;
/** Coalesce dashboard/LB polls — full Prisma rows must not go through Redis JSON. */
const SCORES_MEM_TTL_MS = 10_000;
let scoresMem:
  | {
      at: number;
      value: Awaited<ReturnType<typeof computeServerLoadScores>>;
    }
  | null = null;
let scoresInFlight: Promise<Awaited<ReturnType<typeof computeServerLoadScores>>> | null = null;

type ServerPoolMove = { streamId: string; toServerId: string; pool: string[] };

async function applyServerPoolMoves(moves: ServerPoolMove[]) {
  for (const move of moves) {
    await prisma.stream.update({
      where: { id: move.streamId },
      data: {
        serverId: move.toServerId,
        serverPoolIds: move.pool.length ? rotatePoolPrimary(move.pool, move.toServerId) : move.pool,
      },
    });
  }
}

/** LIVE+active rows per server — never count the whole VOD/series catalog (can be 800k+). */
async function liveCatalogAssignedByServer(): Promise<Map<string, number>> {
  const rows = await prisma.stream.groupBy({
    by: ["serverId"],
    where: { type: "LIVE", isActive: true, serverId: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.serverId) continue;
    map.set(row.serverId, row._count._all);
  }
  return map;
}

async function computeServerLoadScores() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const [servers, connRows, catalogByServer] = await Promise.all([
    prisma.streamServer.findMany({
      where: { isActive: true },
      include: {
        processes: { where: { status: "running", lastSeenAt: { gte: staleBefore } } },
      },
    }),
    prisma.liveConnection.findMany({
      where: { lastSeenAt: { gte: staleBefore }, stream: { serverId: { not: null } } },
      select: { stream: { select: { serverId: true } } },
    }),
    liveCatalogAssignedByServer(),
  ]);

  const liveByServer = new Map<string, number>();
  for (const c of connRows) {
    const sid = c.stream?.serverId;
    if (!sid) continue;
    liveByServer.set(sid, (liveByServer.get(sid) ?? 0) + 1);
  }

  return servers.map((s) => {
    const catalogAssigned = catalogByServer.get(s.id) ?? 0;
    const running = s.processes.length;
    const liveConnections = liveByServer.get(s.id) ?? 0;
    const slotsUsed = viewerSlotsUsed(liveConnections, running);
    const slots = s.maxClients > 0 ? s.maxClients : 1000;
    const bitrateSum = s.processes.reduce((acc, p) => acc + (p.bitrateKbps ?? 0), 0);
    const usedMbps = estimatedLiveBandwidthMbps(liveConnections, bitrateSum);
    const nicCap = s.bandwidthMbps && s.bandwidthMbps > 0 ? s.bandwidthMbps : 0;
    const egress = serverEgressHeadroom({
      usedMbps,
      nicCapMbps: nicCap,
      slotRatio: slotsUsed / slots,
    });
    return {
      server: s,
      slotsUsed,
      catalogAssigned,
      liveConnections,
      slots,
      score: slotsUsed / slots,
      bandwidthMbps: usedMbps,
      capMbps: egress.capMbps,
      headroomMbps: egress.headroomMbps,
      headroomPct: egress.headroomPct,
      saturated: egress.saturated,
      online: isServerHealthOnline(s.healthStatus),
    };
  });
}

export async function getServerLoadScores(_opts?: { includeCatalogCounts?: boolean }) {
  const now = Date.now();
  if (scoresMem && now - scoresMem.at < SCORES_MEM_TTL_MS) {
    return scoresMem.value;
  }
  if (scoresInFlight) return scoresInFlight;

  scoresInFlight = computeServerLoadScores()
    .then((value) => {
      scoresMem = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      scoresInFlight = null;
    });
  return scoresInFlight;
}
export async function pickLeastLoadedServerId(clientIp?: string): Promise<string | null> {
  if (clientIp) {
    const { pickServerForClient } = await import("@/lib/server-geo-lb");
    const geoPick = await pickServerForClient(clientIp);
    if (geoPick) {
      const scores = await getServerLoadScores();
      const roleCtx = roleCtxFromScores(scores);
      const hit = scores.find((x) => x.server.id === geoPick);
      if (hit && resolveServerRole(hit.server, roleCtx) !== "main") return geoPick;
    }
  }
  return pickNamedOrLeastLb(await getServerLoadScores());
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
  const lbs = preferHeadroomPool(
    scores.filter((x) => {
      if (!x.server.isActive) return false;
      return resolveServerRole(x.server, roleCtx) !== "main";
    })
  );
  if (!lbs.length) return null;
  const named = lbs
    .filter((x) => isTenGigLbLabel(String(x.server.name ?? ""), String(x.server.host ?? "")))
    .sort((a, b) => b.slots - a.slots);
  if (named[0]) return named[0].server.id;
  const sorted = [...lbs].sort((a, b) => a.score - b.score);
  return sorted[0]?.server.id ?? null;
}

/** Prefer an explicit LB; if missing or Main, use the 10Gbps LB. */
function pickIdFromOrderedPool(
  scores: Awaited<ReturnType<typeof getServerLoadScores>>,
  pool: string[]
): string | null {
  const byId = new Map(scores.map((x) => [x.server.id, x]));
  const ordered = pool.map((id) => byId.get(id)).filter(Boolean);
  const ready = ordered.find((x) => x!.online && x!.server.isActive && !x!.saturated);
  if (ready) return ready.server.id;
  const online = ordered.find((x) => x!.online && x!.server.isActive);
  return online?.server.id ?? pool[0] ?? null;
}

export async function resolvePlaybackLoadBalancerId(
  preferred?: string | null,
  pool?: unknown
): Promise<string | null> {
  const scores = await getServerLoadScores();
  const ordered = normalizeServerPool(pool, preferred);
  if (ordered.length > 1 || (ordered.length === 1 && pool != null)) {
    return pickIdFromOrderedPool(scores, ordered);
  }
  const roleCtx = roleCtxFromScores(scores);
  const id = preferred?.trim() || "";
  if (id) {
    const hit = scores.find((x) => x.server.id === id);
    if (hit?.server.isActive && !hit.saturated && resolveServerRole(hit.server, roleCtx) !== "main") {
      return id;
    }
  }
  return pickNamedOrLeastLb(scores);
}

function lbHasDirectMediaEndpoint(server: { host?: string | null; domain?: string | null }): boolean {
  return Boolean(String(server.host || "").trim() || String(server.domain || "").trim());
}

function lbHealthUnavailable(healthStatus?: string | null): boolean {
  const s = String(healthStatus ?? "").toLowerCase();
  return s === "offline" || s === "degraded" || s === "down";
}

/** Pure sticky-keep predicate for tests and resolveStickyLineLoadBalancerId. */
export function shouldKeepStickyLineLb(opts: {
  preferredActive: boolean;
  healthStatus?: string | null;
  role: "main" | "lb";
  hasMediaEndpoint: boolean;
}): boolean {
  return (
    opts.preferredActive &&
    !lbHealthUnavailable(opts.healthStatus) &&
    opts.role !== "main" &&
    opts.hasMediaEndpoint
  );
}

/**
 * Sticky line→LB assignment for playlist / Xtream origins.
 * Keep the preferred LB unless it is inactive, explicitly unhealthy, main-role,
 * or missing a direct media host. Saturation alone does not move existing lines;
 * new lines still land on headroom via pickNamedOrLeastLb.
 */
export async function resolveStickyLineLoadBalancerId(
  preferred?: string | null
): Promise<string | null> {
  const scores = await getServerLoadScores();
  const roleCtx = roleCtxFromScores(scores);
  const id = preferred?.trim() || "";
  if (id) {
    const hit = scores.find((x) => x.server.id === id);
    if (
      hit &&
      shouldKeepStickyLineLb({
        preferredActive: hit.server.isActive,
        healthStatus: hit.server.healthStatus,
        role: resolveServerRole(hit.server, roleCtx) === "main" ? "main" : "lb",
        hasMediaEndpoint: lbHasDirectMediaEndpoint(hit.server),
      })
    ) {
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
  const offlineIds = new Set(offline.map((s) => s.id));

  const scores = await getServerLoadScores();
  const fallback = await pickLeastLoadedServerId();
  if (!fallback || offlineIds.has(fallback)) return 0;

  const streams = await prisma.stream.findMany({
    where: { serverId: { in: [...offlineIds] } },
    select: { id: true, serverId: true, serverPoolIds: true },
  });
  let moved = 0;
  for (const stream of streams) {
    const pool = parseStoredServerPool(stream.serverPoolIds, stream.serverId);
    const fromPool = pickIdFromOrderedPool(
      scores,
      pool.filter((id) => !offlineIds.has(id))
    );
    const dest = fromPool && !offlineIds.has(fromPool) ? fromPool : fallback;
    if (!dest || dest === stream.serverId) continue;
    const nextPool = pool.length ? rotatePoolPrimary(pool, dest) : [dest];
    await prisma.stream.update({
      where: { id: stream.id },
      data: { serverId: dest, serverPoolIds: nextPool },
    });
    moved += 1;
  }
  return moved;
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
  const online = preferHeadroomPool(
    scores.filter((x) => {
      if (!x.online || !x.server.isActive) return false;
      if (!includeMain && mainIds.has(x.server.id)) return false;
      return true;
    })
  );
  if (online.length < 1) return { moved: 0, servers: 0 };

  const maxMoves = Math.max(1, Math.min(opts?.maxMoves ?? 80, 400));

  // Drain live catalog off the panel/main host onto LB nodes.
  if (!includeMain && mainIds.size && online.length >= 1) {
    const drainMoves: ServerPoolMove[] = [];
    for (const mainId of mainIds) {
      if (drainMoves.length >= maxMoves) break;
      const take = Math.min(maxMoves - drainMoves.length, 400);
      const streams = await prisma.stream.findMany({
        where: { type: "LIVE", isActive: true, serverId: mainId },
        select: { id: true, serverId: true, serverPoolIds: true },
        orderBy: { updatedAt: "asc" },
        take,
      });
      let i = 0;
      for (const stream of streams) {
        const pool = parseStoredServerPool(stream.serverPoolIds, stream.serverId);
        const dest =
          online.find((row, idx) => {
            const candidate = online[(i + idx) % online.length]!;
            return poolAllowsServer(pool, candidate.server.id);
          }) ?? null;
        if (!dest) continue;
        drainMoves.push({ streamId: stream.id, toServerId: dest.server.id, pool });
        i++;
      }
    }
    if (drainMoves.length) {
      await applyServerPoolMoves(drainMoves);
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

  const moves: ServerPoolMove[] = [];

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
      select: { id: true, serverId: true, serverPoolIds: true },
      orderBy: { updatedAt: "asc" },
      take,
    });

    let i = 0;
    for (const stream of streams) {
      if (moves.length >= maxMoves) break;
      const pool = parseStoredServerPool(stream.serverPoolIds, stream.serverId);
      let placed = false;
      for (let r = 0; r < receivers.length; r++) {
        const recv = receivers[(i + r) % receivers.length]!;
        const want = targets.get(recv.server.id) ?? 0;
        const already = moves.filter((m) => m.toServerId === recv.server.id).length;
        if (recv.catalogAssigned + already >= want) continue;
        if (!poolAllowsServer(pool, recv.server.id)) continue;
        moves.push({ streamId: stream.id, toServerId: recv.server.id, pool });
        placed = true;
        i++;
        break;
      }
      if (!placed) break;
    }
  }

  if (!moves.length) return { moved: 0, servers: online.length };

  await applyServerPoolMoves(moves);

  return { moved: moves.length, servers: online.length };
}
