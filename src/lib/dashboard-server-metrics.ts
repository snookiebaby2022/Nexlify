import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { listActiveConnections } from "@/lib/connections";

const STALE_MS = 5 * 60 * 1000;
const ASSUMED_RAM_MB = 16 * 1024;

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
};

export type DashboardKpiExtended = {
  paidUsers: number;
  trialUsers: number;
  unstableStreams: number;
  deadStreams: number;
  reportedChannels: number;
  channelRequests: number;
  networkInMbps: number;
  networkOutMbps: number;
};

function clampPct(n: number) {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export async function getDashboardServerMetrics(): Promise<ServerMetricsRow[]> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const servers = await prisma.streamServer.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { streams: true } },
      processes: { where: { lastSeenAt: { gte: staleBefore } } },
      streams: {
        where: { isActive: true, type: StreamType.LIVE },
        select: { id: true, lastProbeOk: true },
      },
    },
  });

  const conns = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { gte: staleBefore } },
    select: { lineId: true, stream: { select: { serverId: true } } },
  });
  const connByServer = new Map<string, Set<string>>();
  for (const c of conns) {
    const sid = c.stream?.serverId;
    if (!sid) continue;
    if (!connByServer.has(sid)) connByServer.set(sid, new Set());
    connByServer.get(sid)!.add(c.lineId);
  }

  return servers.map((s) => {
    const online =
      s.healthStatus === "online" ||
      s.healthStatus === "healthy" ||
      (s.agentLastSeen != null && s.agentLastSeen >= staleBefore);

    if (!online) {
      return {
        id: s.id,
        name: s.name,
        host: s.host,
        online: false,
        upload: 0,
        download: 0,
        memory: 0,
        storage: 0,
        cpu: 0,
      };
    }

    const running = s.processes.filter((p) => p.status === "running");
    const cpuVals = running.map((p) => p.cpuPercent).filter((v): v is number => v != null && v >= 0);
    const memMb = running.reduce((a, p) => a + (p.memoryMb ?? 0), 0);
    const bitrate = running.reduce((a, p) => a + (p.bitrateKbps ?? 0), 0);
    const slots = s.maxClients > 0 ? s.maxClients : 1000;
    const slotsUsed = Math.max(s._count.streams, running.length);

    const cpu =
      cpuVals.length > 0
        ? cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length
        : Math.min(40, 8 + slotsUsed * 2);

    const memory = memMb > 0 ? (memMb / ASSUMED_RAM_MB) * 100 : Math.min(90, 20 + slotsUsed * 4);

    const capKbps = (s.bandwidthMbps ?? 100) * 1000;
    const download = capKbps > 0 ? (bitrate / capKbps) * 100 : Math.min(60, bitrate / 50);
    const upload = download > 0 ? Math.min(100, download * 0.15 + 2) : Math.min(15, running.length * 2);

    const storage = (slotsUsed / slots) * 100;
    const serverConns = connByServer.get(s.id);
    const streamsOn = s.streams.filter((st) => st.lastProbeOk === true).length;
    const streamsOff = s.streams.filter((st) => st.lastProbeOk === false).length;

    return {
      id: s.id,
      name: s.name,
      host: s.host,
      online: true,
      upload: clampPct(upload),
      download: clampPct(download),
      memory: clampPct(memory),
      storage: clampPct(storage),
      cpu: clampPct(cpu),
      connections: serverConns?.size ?? 0,
      users: serverConns?.size ?? 0,
      streamsOn,
      streamsOff,
    };
  });
}

const TRIAL_MAX_DAYS = 2.5;

function isTrialLine(createdAt: Date, expiresAt: Date) {
  const days = (expiresAt.getTime() - createdAt.getTime()) / 86400000;
  return days <= TRIAL_MAX_DAYS;
}

export async function getDashboardKpiExtended(): Promise<DashboardKpiExtended> {
  const now = new Date();
  const staleBefore = new Date(Date.now() - STALE_MS);

  const [activeLines, liveStreams, snapshots, tickets] = await Promise.all([
    prisma.line.findMany({
      where: { status: "ACTIVE", expiresAt: { gt: now } },
      select: { createdAt: true, expiresAt: true },
    }),
    prisma.stream.findMany({
      where: { type: StreamType.LIVE, isActive: true },
      select: { lastProbeOk: true, backupUrl: true },
    }),
    prisma.bandwidthSnapshot.findMany({ take: 1, orderBy: { createdAt: "desc" } }),
    prisma.ticket.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { subject: true },
    }),
  ]);

  let trialUsers = 0;
  let paidUsers = 0;
  for (const l of activeLines) {
    if (isTrialLine(l.createdAt, l.expiresAt)) trialUsers++;
    else paidUsers++;
  }

  let deadStreams = 0;
  let unstableStreams = 0;
  for (const s of liveStreams) {
    if (s.lastProbeOk === false) {
      if (s.backupUrl?.trim()) unstableStreams++;
      else deadStreams++;
    }
  }

  const channelRx = /channel|stream|epg|vod|missing|report|add request/i;
  let reportedChannels = 0;
  let channelRequests = 0;
  for (const t of tickets) {
    if (!channelRx.test(t.subject)) continue;
    if (/request|add|new/i.test(t.subject)) channelRequests++;
    else reportedChannels++;
  }

  const snap = snapshots[0];
  const networkInMbps = snap ? Number(snap.bytesIn) / 125_000 : 0;
  const networkOutMbps = snap ? Number(snap.bytesOut) / 125_000 : 0;

  return {
    paidUsers,
    trialUsers,
    unstableStreams,
    deadStreams,
    reportedChannels,
    channelRequests,
    networkInMbps: Math.round(networkInMbps),
    networkOutMbps: Math.round(networkOutMbps),
  };
}

export async function getDashboardSummary() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const [
    totalLiveStreams,
    runningStreamIds,
    totalActiveLines,
    linesWithConnections,
    connections,
    allServers,
    onlineServerCount,
  ] = await Promise.all([
    prisma.stream.count({ where: { type: StreamType.LIVE, isActive: true } }),
    prisma.streamProcess.findMany({
      where: { status: "running", lastSeenAt: { gte: staleBefore } },
      select: { streamId: true },
      distinct: ["streamId"],
    }),
    prisma.line.count({
      where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    }),
    prisma.liveConnection.findMany({
      where: { lastSeenAt: { gte: staleBefore } },
      select: { lineId: true },
      distinct: ["lineId"],
    }),
    listActiveConnections(),
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

  const onlineStreams = runningStreamIds.filter((r) => r.streamId).length;
  const onlineUsers = linesWithConnections.length;
  const streamSettings = await getSettingGroup("streams");
  const perLine = Number(streamSettings.maxConnectionsPerLine ?? 0);
  const maxConnections =
    perLine > 0 && totalActiveLines > 0 ? perLine * totalActiveLines : 0;

  return {
    onlineStreams,
    totalLiveStreams,
    onlineUsers,
    totalActiveLines,
    onlineConnections: connections.length,
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
    runningStreamIds,
    totalActiveLines,
    ownerLineIds,
    connections,
    allServers,
    onlineServerCount,
  ] = await Promise.all([
    prisma.stream.count({ where: { type: StreamType.LIVE, isActive: true } }),
    prisma.streamProcess.findMany({
      where: { status: "running", lastSeenAt: { gte: staleBefore } },
      select: { streamId: true },
      distinct: ["streamId"],
    }),
    prisma.line.count({
      where: { ...lineWhere, status: "ACTIVE", expiresAt: { gt: now } },
    }),
    prisma.line.findMany({ where: lineWhere, select: { id: true } }),
    listActiveConnections(ownerId),
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

  const lineIdSet = new Set(ownerLineIds.map((l) => l.id));
  const ownerConnections = connections;
  const linesWithConnections = await prisma.liveConnection.findMany({
    where: {
      lineId: { in: [...lineIdSet] },
      lastSeenAt: { gte: staleBefore },
    },
    select: { lineId: true },
    distinct: ["lineId"],
  });

  const streamSettings = await getSettingGroup("streams");
  const perLine = Number(streamSettings.maxConnectionsPerLine ?? 0);
  const maxConnections =
    perLine > 0 && totalActiveLines > 0 ? perLine * totalActiveLines : 0;

  return {
    onlineStreams: runningStreamIds.filter((r) => r.streamId).length,
    totalLiveStreams,
    onlineUsers: linesWithConnections.length,
    totalActiveLines,
    onlineConnections: ownerConnections.length,
    maxConnections,
    onlineServers: onlineServerCount,
    totalServers: allServers,
  };
}
