import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { STALE_MS, isTestConnectionIp, liveViewerStats, listLiveConnections } from "@/lib/connections";
import { sortServersMainFirst } from "@/lib/ensure-main-server-online";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import {
  readStoredHostMetrics,
  sampleLocalHostMetrics,
  snapshotWindowToMbps,
  type HostMetricsSample,
} from "@/lib/host-metrics";
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
  streamsOn?: number;
  streamsOff?: number;
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
  const staleBefore = new Date(Date.now() - STALE_MS);
  const servers = await prisma.streamServer.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      host: true,
      healthStatus: true,
      agentToken: true,
      agentLastSeen: true,
      bandwidthMbps: true,
      panelSettings: true,
      maxClients: true,
      sortOrder: true,
    },
  });

  const [liveRows, streamProbeCounts] = await Promise.all([
    listLiveConnections(),
    prisma.stream.groupBy({
      by: ["serverId", "lastProbeOk"],
      where: { isActive: true, type: StreamType.LIVE, serverId: { not: null } },
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

  const onByServer = new Map<string, number>();
  const offByServer = new Map<string, number>();
  for (const row of streamProbeCounts) {
    if (!row.serverId) continue;
    if (row.lastProbeOk === true) onByServer.set(row.serverId, row._count);
    else if (row.lastProbeOk === false) offByServer.set(row.serverId, row._count);
  }

  const ordered = sortServersMainFirst(servers);
  let localSample: HostMetricsSample | null = null;

  const rows: ServerMetricsRow[] = [];
  for (const s of ordered) {
    const managed =
      isThisPanelMachine(s) ||
      (s.agentToken != null && s.agentLastSeen != null && s.agentLastSeen >= staleBefore);
    const connections = connsByServer.get(s.id) ?? 0;
    const users = usersByServer.get(s.id)?.size ?? 0;
    const streamsOn = onByServer.get(s.id) ?? 0;
    const streamsOff = offByServer.get(s.id) ?? 0;

    if (!managed) {
      rows.push({
        id: s.id,
        name: s.name,
        host: s.host,
        online: false,
        upload: 0,
        download: 0,
        memory: 0,
        storage: 0,
        cpu: 0,
        connections,
        users,
        streamsOn,
        streamsOff,
        maxClients: s.maxClients,
      });
      continue;
    }

    let host = emptyHostSample();
    if (isThisPanelMachine(s)) {
      if (!localSample) {
        localSample = sampleLocalHostMetrics(s.bandwidthMbps ?? 1000);
      }
      host = localSample;
    } else {
      host = readStoredHostMetrics(s.panelSettings) ?? emptyHostSample();
    }

    rows.push({
      id: s.id,
      name: s.name,
      host: s.host,
      online: true,
      upload: clampPct(host.upload),
      download: clampPct(host.download),
      memory: clampPct(host.memory),
      storage: clampPct(host.storage),
      cpu: clampPct(host.cpu),
      connections,
      users,
      streamsOn,
      streamsOff,
      maxClients: s.maxClients,
    });
  }

  return rows;
}

const TRIAL_MAX_DAYS = 2.5;

export async function getDashboardKpiExtended(): Promise<DashboardKpiExtended> {
  const now = new Date();
  const trialMs = TRIAL_MAX_DAYS * 86400000;

  const [
    paidUsers,
    trialUsers,
    deadStreams,
    unstableStreams,
    snapshots,
    tickets,
    inactiveByType,
    openTicketCount,
  ] = await Promise.all([
    prisma.line.count({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
        // paid = expire window longer than trial
        AND: [
          {
            expiresAt: {
              gt: new Date(now.getTime()),
            },
          },
        ],
      },
    }),
    // Approximate trial: expires within trial window from create — use raw for speed
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM "Line"
      WHERE status = 'ACTIVE' AND "expiresAt" > ${now}
        AND ("expiresAt" - "createdAt") <= (${trialMs} * interval '1 millisecond')
    `.then((r) => Number(r[0]?.count ?? 0)).catch(() => 0),
    prisma.stream.count({
      where: { type: StreamType.LIVE, isActive: true, lastProbeOk: false, OR: [{ backupUrl: null }, { backupUrl: "" }] },
    }),
    prisma.stream.count({
      where: {
        type: StreamType.LIVE,
        isActive: true,
        lastProbeOk: false,
        AND: [{ backupUrl: { not: null } }, { backupUrl: { not: "" } }],
      },
    }),
    prisma.bandwidthSnapshot.findMany({ take: 1, orderBy: { createdAt: "desc" } }),
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

  const liveNic = sampleLocalHostMetrics();
  let networkInMbps = liveNic.downloadMbps;
  let networkOutMbps = liveNic.uploadMbps;
  const snap = snapshots[0];
  if (networkInMbps <= 0 && networkOutMbps <= 0 && snap) {
    networkInMbps = snapshotWindowToMbps(snap.bytesIn);
    networkOutMbps = snapshotWindowToMbps(snap.bytesOut);
  }

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
    networkInMbps: Math.round(networkInMbps * 10) / 10,
    networkOutMbps: Math.round(networkOutMbps * 10) / 10,
    inactiveStreams: inactiveLive + inactiveMovies + inactiveSeries,
    inactiveLive,
    inactiveMovies,
    inactiveSeries,
    offlineStreams: deadStreams + unstableStreams,
    openTickets: openTicketCount,
  };
}

export async function getDashboardSummary() {
  const staleBefore = new Date(Date.now() - STALE_MS);
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
      where: {
        OR: [
          { healthStatus: { in: ["online", "healthy"] } },
          { agentLastSeen: { gte: staleBefore } },
        ],
      },
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
  const staleBefore = new Date(Date.now() - STALE_MS);
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
      where: {
        OR: [
          { healthStatus: { in: ["online", "healthy"] } },
          { agentLastSeen: { gte: staleBefore } },
        ],
      },
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
