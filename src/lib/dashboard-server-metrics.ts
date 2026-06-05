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
    },
  });

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
    };
  });
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

  const lineIdSet = new Set(ownerLineIds.map((l) => l.id));
  const ownerConnections = connections.filter((c) => lineIdSet.has(c.lineId));
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
