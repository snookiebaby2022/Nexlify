import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const LB_PREFIX = "lb:server:";
const LB_METRICS_PREFIX = "lb:metrics:";

export type ServerMetrics = {
  serverId: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  connections: number;
  streams: number;
  loadScore: number;
  lastUpdated: number;
};

export type LoadBalanceDecision = {
  serverId: string;
  serverUrl: string;
  reason: string;
  score: number;
};

function metricsKey(serverId: string): string {
  return `${LB_METRICS_PREFIX}${serverId}`;
}

export async function getServerMetrics(serverId: string): Promise<ServerMetrics | null> {
  return cacheGet<ServerMetrics>(metricsKey(serverId));
}

export async function setServerMetrics(metrics: ServerMetrics): Promise<void> {
  const loadScore = calculateLoadScore(metrics);
  await cacheSet(metricsKey(metrics.serverId), {
    ...metrics,
    loadScore,
    lastUpdated: Date.now(),
  }, 30);
}

export function calculateLoadScore(metrics: ServerMetrics): number {
  const cpuWeight = 0.35;
  const memWeight = 0.25;
  const connWeight = 0.25;
  const netWeight = 0.15;
  const cpuScore = Math.min(100, metrics.cpu);
  const memScore = Math.min(100, metrics.memory);
  const connScore = Math.min(100, (metrics.connections / 1000) * 100);
  const netScore = Math.min(100, ((metrics.networkIn + metrics.networkOut) / 10000) * 100);
  return Math.round(
    cpuScore * cpuWeight +
    memScore * memWeight +
    connScore * connWeight +
    netScore * netWeight
  );
}

export async function getAllServerMetrics(): Promise<ServerMetrics[]> {
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const metrics = await Promise.all(
    servers.map((s: { id: string }) => getServerMetrics(s.id))
  );
  return metrics.filter((m): m is ServerMetrics => m !== null);
}

export async function selectBestServer(
  excludeServerId?: string
): Promise<LoadBalanceDecision | null> {
  const allMetrics = await getAllServerMetrics();
  const available = allMetrics
    .filter((m) => m.serverId !== excludeServerId && m.loadScore < 95)
    .sort((a, b) => a.loadScore - b.loadScore);

  if (available.length === 0) return null;
  const best = available[0];
  const server = await prisma.streamServer.findUnique({
    where: { id: best.serverId },
    select: { id: true, host: true, port: true, protocol: true, domain: true },
  });
  if (!server) return null;

  const host = server.domain?.trim() || server.host;
  const serverUrl = `${server.protocol || "http"}://${host}:${server.port}`;

  return {
    serverId: server.id,
    serverUrl,
    reason: `Lowest load score: ${best.loadScore}%`,
    score: best.loadScore,
  };
}

export async function getServerHealthStatus(): Promise<
  { serverId: string; status: "healthy" | "degraded" | "critical"; loadScore: number }[]
> {
  const allMetrics = await getAllServerMetrics();
  return allMetrics.map((m) => ({
    serverId: m.serverId,
    status:
      m.loadScore < 60 ? "healthy" as const :
      m.loadScore < 85 ? "degraded" as const :
      "critical" as const,
    loadScore: m.loadScore,
  }));
}

export async function enforceLoadBalance(): Promise<{
  redistributed: number;
  decisions: LoadBalanceDecision[];
}> {
  const overloaded = (await getAllServerMetrics()).filter((m) => m.loadScore > 85);
  const decisions: LoadBalanceDecision[] = [];
  let redistributed = 0;

  for (const server of overloaded) {
    const target = await selectBestServer(server.serverId);
    if (target) {
      decisions.push(target);
      redistributed++;
    }
  }
  return { redistributed, decisions };
}
