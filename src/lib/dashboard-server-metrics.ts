import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { liveOriginOrSpliceFailWhere } from "@/lib/stream-health-fail";
import { isTestConnectionIp, liveViewerStats, listLiveConnections } from "@/lib/connections";
import {
  buildServerRoleContext,
  resolveServerRole,
  sortServersMainFirst,
} from "@/lib/ensure-main-server-online";
import { getServerLoadScores } from "@/lib/server-load";
import { cacheGetOrSet } from "@/lib/cache";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import { isServerHealthOnline } from "@/lib/server-tree";
import {
  readStoredHostMetrics,
  sampleLocalHostMetrics,
  getDashboardNicBandwidthMbps,
  persistHostMetrics,
  metricsFresh,
  type HostMetricsSample,
} from "@/lib/host-metrics";
import { getServerMetrics } from "@/lib/load-balancer";
import { scheduleServerHostMetricsSync } from "@/lib/server-host-metrics-sync";
import {
  classifyTicketSubject,
  emptyBreakdown,
  sumBreakdown,
  type TicketContentBreakdown,
} from "@/lib/ticket-content-types";

export type ServerMetricsRow = {
  id: string;
  name: string;
  host: string;
  online: boolean;
  upload: number;
  download: number;
  memory: number;
  storage: number;
  cpu: number;
  connections?: number;
  users?: number;
  /** LIVE channels assigned to this server (same assignment as Manage Servers). */
  streamsOn?: number;
  /** LIVE channels whose last source probe failed. */
  streamsOff?: number;
  /** Movies + series (+ other non-live) assigned to this server. */
  vodStreams?: number;
  maxClients?: number;
};

export type DashboardKpiExtended = {
  paidUsers: number;
  trialUsers: number;
  unstableStreams: number;
  deadStreams: number;
  reportedChannels: number;
  channelRequests: number;
  /** Breakdown under User Reported Channels (live + movies + series). */
  reportedBreakdown: TicketContentBreakdown;
  /** Breakdown under New Channels Add Request (live + movies + series). */
  requestBreakdown: TicketContentBreakdown;
  networkInMbps: number;
  networkOutMbps: number;
  /** Total LB NIC capacity (Mbps). */
  lbCapMbps: number;
  /** Panel NIC throughput (any traffic). UI labels this "Panel NIC" and only shows when high. */
  panelProxyMbps: number;
  /** True when LB egress comes from agent NIC samples, not connection estimates. */
  bandwidthMeasured: boolean;
  inactiveStreams: number;
  inactiveLive: number;
  inactiveMovies: number;
  inactiveSeries: number;
  offlineStreams: number;
  openTickets: number;
};

function clampPct(n: number) {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function hostSampleFromLbCache(
  cached: Awaited<ReturnType<typeof getServerMetrics>>,
  bandwidthMbps: number
): HostMetricsSample | null {
  if (!cached) return null;
  const cap = Math.max(1, bandwidthMbps);
  const sample: HostMetricsSample = {
    cpu: clampPct(cached.cpu),
    memory: clampPct(cached.memory),
    storage: 0,
    upload: clampPct(cached.networkOut),
    download: clampPct(cached.networkIn),
    uploadMbps: Math.round(((cached.networkOut / 100) * cap) * 10) / 10,
    downloadMbps: Math.round(((cached.networkIn / 100) * cap) * 10) / 10,
    at: cached.lastUpdated,
  };
  return metricsFresh(sample) ? sample : null;
}

function metricsMissingOrZero(sample: HostMetricsSample | null): boolean {
  if (!sample) return true;
  return (
    sample.cpu === 0 &&
    sample.memory === 0 &&
    sample.storage === 0 &&
    sample.upload === 0 &&
    sample.download === 0
  );
}

function emptyHostSample(): HostMetricsSample {
  return {
    cpu: 0,
    memory: 0,
    storage: 0,
    upload: 0,
    download: 0,
    uploadMbps: 0,
    downloadMbps: 0,
    at: Date.now(),
  };
}

export async function getDashboardServerMetrics(): Promise<ServerMetricsRow[]> {
  const servers = await prisma.streamServer.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      host: true,
      healthStatus: true,
      bandwidthMbps: true,
      panelSettings: true,
      maxClients: true,
      sortOrder: true,
    },
  });

  const [liveRows, catalogCounts, probeFailed] = await Promise.all([
    listLiveConnections(),
    prisma.stream.groupBy({
      by: ["serverId", "type"],
      where: { serverId: { not: null } },
      _count: true,
    }),
    prisma.stream.groupBy({
      by: ["serverId"],
      where: {
        isActive: true,
        type: StreamType.LIVE,
        serverId: { not: null },
        lastProbeOk: false,
      },
      _count: true,
    }),
  ]);

  const usersByServer = new Map<string, Set<string>>();
  const connsByServer = new Map<string, number>();
  for (const row of liveRows) {
    if (isTestConnectionIp(row.ip)) continue;
    const serverId = row.stream?.serverId ?? row.stream?.server?.id;
    if (!serverId) continue;
    connsByServer.set(serverId, (connsByServer.get(serverId) ?? 0) + 1);
    let users = usersByServer.get(serverId);
    if (!users) {
      users = new Set();
      usersByServer.set(serverId, users);
    }
    users.add(row.lineId);
  }

  const liveByServer = new Map<string, number>();
  const vodByServer = new Map<string, number>();
  for (const row of catalogCounts) {
    if (!row.serverId) continue;
    if (row.type === StreamType.LIVE) {
      liveByServer.set(row.serverId, (liveByServer.get(row.serverId) ?? 0) + row._count);
    } else {
      vodByServer.set(row.serverId, (vodByServer.get(row.serverId) ?? 0) + row._count);
    }
  }

  const offByServer = new Map(
    probeFailed.filter((r) => r.serverId).map((r) => [r.serverId as string, r._count])
  );

  const ordered = sortServersMainFirst(servers);
  let localSample: HostMetricsSample | null = null;

  const remotesNeedingCache = ordered.filter((s) => {
    if (isThisPanelMachine(s)) return false;
    const stored = readStoredHostMetrics(s.panelSettings);
    return !stored || !metricsFresh(stored) || metricsMissingOrZero(stored);
  });
  const lbCacheEntries = await Promise.all(
    remotesNeedingCache.map(async (s) => [s.id, await getServerMetrics(s.id).catch(() => null)] as const)
  );
  const lbCacheById = new Map(lbCacheEntries);

  const rows: ServerMetricsRow[] = [];
  for (const s of ordered) {
    const online = isServerHealthOnline(s.healthStatus);
    const connections = connsByServer.get(s.id) ?? 0;
    const users = usersByServer.get(s.id)?.size ?? 0;
    const streamsOn = liveByServer.get(s.id) ?? 0;
    const streamsOff = offByServer.get(s.id) ?? 0;
    const vodStreams = vodByServer.get(s.id) ?? 0;

    let host = emptyHostSample();
    const cap = s.bandwidthMbps ?? 1000;
    if (isThisPanelMachine(s)) {
      if (!localSample) {
        localSample = sampleLocalHostMetrics(cap);
        await persistHostMetrics(s.id, localSample).catch(() => {});
      }
      host = localSample;
    } else {
      host = readStoredHostMetrics(s.panelSettings) ?? emptyHostSample();
      if (!metricsFresh(host) || metricsMissingOrZero(host)) {
        host = emptyHostSample();
        const fromCache = hostSampleFromLbCache(lbCacheById.get(s.id) ?? null, cap);
        if (fromCache && !metricsMissingOrZero(fromCache)) host = fromCache;
      }
      if (online && (!metricsFresh(host) || metricsMissingOrZero(host))) {
        scheduleServerHostMetricsSync(s.id);
      }
    }

    rows.push({
      id: s.id,
      name: s.name,
      host: s.host,
      online,
      upload: clampPct(host.upload),
      download: clampPct(host.download),
      memory: clampPct(host.memory),
      storage: clampPct(host.storage),
      cpu: clampPct(host.cpu),
      connections,
      users,
      streamsOn,
      streamsOff,
      vodStreams,
      maxClients: s.maxClients,
    });
  }

  return rows;
}

const TRIAL_MAX_DAYS = 2.5;

export type DashboardPlaybackBandwidth = {
  networkInMbps: number;
  networkOutMbps: number;
  lbCapMbps: number;
  /** Panel host NIC Mbps (API/admin/etc). Not LB viewer egress. */
  panelProxyMbps: number;
  measured: boolean;
};

/** Live viewer egress on online load balancers only (never panel NIC / hairpin). */
export async function getDashboardPlaybackBandwidth(): Promise<DashboardPlaybackBandwidth> {
  return cacheGetOrSet("stats:playback-bw:v2", 10, async () => {
    const [scores, panelNic] = await Promise.all([
      getServerLoadScores(),
      getDashboardNicBandwidthMbps(),
    ]);
    const ctx = buildServerRoleContext(scores.map((s) => s.server));
    // Stream boxes only — main/panel is never counted toward LB egress.
    const lbs = scores.filter((s) => s.online && resolveServerRole(s.server, ctx) === "lb");

    let measuredOut = 0;
    let hasMeasured = false;
    for (const lb of lbs) {
      const host = readStoredHostMetrics(lb.server.panelSettings, true);
      if (host && host.uploadMbps > 0) {
        measuredOut += host.uploadMbps;
        hasMeasured = true;
      }
    }

    const estimatedOut = lbs.reduce((n, s) => n + s.bandwidthMbps, 0);
    const out = hasMeasured ? measuredOut : estimatedOut;
    const cap = lbs.reduce((n, s) => n + s.capMbps, 0);
    const rounded = Math.round(out * 10) / 10;

    return {
      networkOutMbps: rounded,
      networkInMbps: rounded,
      lbCapMbps: cap,
      // Kept for API compatibility / ops elsewhere — not shown on LB egress KPI.
      panelProxyMbps: Math.round(Math.max(panelNic.networkInMbps, panelNic.networkOutMbps) * 10) / 10,
      measured: hasMeasured,
    };
  });
}

export async function getDashboardKpiExtended(): Promise<DashboardKpiExtended> {
  const now = new Date();
  const trialMs = TRIAL_MAX_DAYS * 86400000;

  const [
    paidUsers,
    trialUsers,
    deadStreams,
    unstableStreams,
    playbackBw,
    tickets,
    inactiveByType,
    openTicketCount,
  ] = await Promise.all([
    prisma.line.count({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
    }),
    // Approximate trial: expires within trial window from create — use raw for speed
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM "Line"
      WHERE status = 'ACTIVE' AND "expiresAt" > ${now}
        AND ("expiresAt" - "createdAt") <= (${trialMs} * interval '1 millisecond')
    `.then((r) => Number(r[0]?.count ?? 0)).catch(() => 0),
    cacheGetOrSet("stats:probe-dead:v1", 300, () =>
      prisma.stream.count({
        where: {
          AND: [liveOriginOrSpliceFailWhere(), { OR: [{ backupUrl: null }, { backupUrl: "" }] }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ),
    cacheGetOrSet("stats:probe-unstable:v1", 300, () =>
      prisma.stream.count({
        where: {
          AND: [
            liveOriginOrSpliceFailWhere(),
            { AND: [{ backupUrl: { not: null } }, { backupUrl: { not: "" } }] },
          ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    ),
    getDashboardPlaybackBandwidth(),
    prisma.ticket.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { subject: true },
      take: 200,
    }),
    prisma.stream.groupBy({
      by: ["type"],
      where: { isActive: false },
      _count: true,
    }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  // paidUsers query above counted all active — subtract trials
  const paid = Math.max(0, paidUsers - trialUsers);

  const reportedBreakdown = emptyBreakdown();
  const requestBreakdown = emptyBreakdown();
  for (const t of tickets) {
    const classified = classifyTicketSubject(t.subject);
    if (!classified) continue;
    const bucket = classified.intent === "request" ? requestBreakdown : reportedBreakdown;
    bucket[classified.content] += 1;
  }
  const reportedChannels = sumBreakdown(reportedBreakdown);
  const channelRequests = sumBreakdown(requestBreakdown);

  const inactiveMap = new Map(inactiveByType.map((r) => [r.type, r._count]));
  const inactiveLive = inactiveMap.get(StreamType.LIVE) ?? 0;
  const inactiveMovies = inactiveMap.get(StreamType.MOVIE) ?? 0;
  const inactiveSeries = inactiveMap.get(StreamType.SERIES) ?? 0;

  return {
    paidUsers: paid,
    trialUsers,
    unstableStreams,
    deadStreams,
    reportedChannels,
    channelRequests,
    reportedBreakdown,
    requestBreakdown,
    networkInMbps: playbackBw.networkInMbps,
    networkOutMbps: playbackBw.networkOutMbps,
    lbCapMbps: playbackBw.lbCapMbps,
    panelProxyMbps: playbackBw.panelProxyMbps,
    bandwidthMeasured: playbackBw.measured,
    inactiveStreams: inactiveLive + inactiveMovies + inactiveSeries,
    inactiveLive,
    inactiveMovies,
    inactiveSeries,
    offlineStreams: deadStreams + unstableStreams,
    openTickets: openTicketCount,
  };
}

export async function getDashboardSummary() {
  const [
    totalLiveStreams,
    totalActiveLines,
    viewer,
    allServers,
    onlineServerCount,
  ] = await Promise.all([
    prisma.stream.count({ where: { type: StreamType.LIVE, isActive: true } }),
    prisma.line.count({
      where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    }),
    liveViewerStats(),
    prisma.streamServer.count(),
    prisma.streamServer.count({
      where: { healthStatus: { in: ["online", "healthy"] } },
    }),
  ]);

  const streamSettings = await getSettingGroup("streams");
  const perLine = Number(streamSettings.maxConnectionsPerLine ?? 0);
  const maxConnections =
    perLine > 0 && totalActiveLines > 0 ? perLine * totalActiveLines : 0;

  return {
    onlineStreams: viewer.onlineStreams,
    totalLiveStreams,
    onlineUsers: viewer.onlineUsers,
    totalActiveLines,
    onlineConnections: viewer.onlineConnections,
    maxConnections,
    onlineServers: onlineServerCount,
    totalServers: allServers,
  };
}

/** Dashboard summary scoped to a reseller/sub-reseller's owned lines. */
export async function getResellerDashboardSummary(ownerId: string) {
  const now = new Date();
  const lineWhere = { ownerId };

  const [
    totalLiveStreams,
    totalActiveLines,
    viewer,
    allServers,
    onlineServerCount,
  ] = await Promise.all([
    prisma.stream.count({ where: { type: StreamType.LIVE, isActive: true } }),
    prisma.line.count({
      where: { ...lineWhere, status: "ACTIVE", expiresAt: { gt: now } },
    }),
    liveViewerStats(ownerId),
    prisma.streamServer.count(),
    prisma.streamServer.count({
      where: { healthStatus: { in: ["online", "healthy"] } },
    }),
  ]);

  const streamSettings = await getSettingGroup("streams");
  const perLine = Number(streamSettings.maxConnectionsPerLine ?? 0);
  const maxConnections =
    perLine > 0 && totalActiveLines > 0 ? perLine * totalActiveLines : 0;

  return {
    onlineStreams: viewer.onlineStreams,
    totalLiveStreams,
    onlineUsers: viewer.onlineUsers,
    totalActiveLines,
    onlineConnections: viewer.onlineConnections,
    maxConnections,
    onlineServers: onlineServerCount,
    totalServers: allServers,
  };
}
