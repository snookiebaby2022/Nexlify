import { prisma } from "@/lib/prisma";
import { decryptAtRest } from "@/lib/encryption-at-rest";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import {
  persistHostMetrics,
  readStoredHostMetrics,
  sampleLocalHostMetrics,
  type HostMetricsSample,
} from "@/lib/host-metrics";
import { setServerMetrics } from "@/lib/load-balancer";
import { sampleHostMetricsOverSshConnect } from "@/lib/ssh-remote-metrics";
import { LIVE_STALE_MS } from "@/lib/connections";

const METRICS_FRESH_MS = 90_000;
const SSH_RETRY_MS = 60_000;
const sshAttemptAt = new Map<string, number>();

function metricsFresh(sample: HostMetricsSample | null): boolean {
  if (!sample) return false;
  return Date.now() - sample.at < METRICS_FRESH_MS;
}

function metricsAllZero(sample: HostMetricsSample | null): boolean {
  if (!sample) return true;
  return sample.cpu === 0 && sample.memory === 0 && sample.storage === 0 && sample.upload === 0 && sample.download === 0;
}

export async function pushServerMetricsCache(
  serverId: string,
  sample: HostMetricsSample,
  connections: number,
  streams: number
): Promise<void> {
  await setServerMetrics({
    serverId,
    cpu: sample.cpu,
    memory: sample.memory,
    networkIn: sample.download,
    networkOut: sample.upload,
    connections,
    streams,
    loadScore: 0,
    lastUpdated: sample.at,
  }).catch(() => {});
}

export async function syncServerHostMetrics(serverId: string): Promise<boolean> {
  const server = await prisma.streamServer.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      host: true,
      agentSshHost: true,
      agentSshPort: true,
      agentSshUser: true,
      agentSshPasswordEnc: true,
      bandwidthMbps: true,
      panelSettings: true,
      isActive: true,
    },
  });
  if (!server?.isActive) return false;

  const cap = server.bandwidthMbps ?? 1000;
  let sample: HostMetricsSample | null = null;

  if (isThisPanelMachine(server)) {
    sample = sampleLocalHostMetrics(cap);
  } else {
    sample = readStoredHostMetrics(server.panelSettings, true);
    if (!metricsFresh(sample) || metricsAllZero(sample)) {
      const lastTry = sshAttemptAt.get(serverId) ?? 0;
      if (Date.now() - lastTry >= SSH_RETRY_MS && server.agentSshPasswordEnc) {
        sshAttemptAt.set(serverId, Date.now());
        try {
          const password = decryptAtRest(server.agentSshPasswordEnc);
          const sshHost = server.agentSshHost?.trim() || server.host;
          const sshSample = await sampleHostMetricsOverSshConnect({
            host: sshHost,
            port: server.agentSshPort ?? 22,
            username: server.agentSshUser?.trim() || "root",
            password,
            bandwidthMbps: cap,
          });
          if (sshSample && !metricsAllZero(sshSample)) sample = sshSample;
        } catch {
          /* SSH optional fallback */
        }
      }
    }
  }

  if (!sample) return false;

  await persistHostMetrics(serverId, sample);

  const liveBefore = new Date(Date.now() - LIVE_STALE_MS);
  const [connections, streams] = await Promise.all([
    prisma.liveConnection.count({
      where: { lastSeenAt: { gte: liveBefore }, stream: { serverId } },
    }),
    prisma.stream.count({ where: { serverId, isActive: true } }),
  ]);
  await pushServerMetricsCache(serverId, sample, connections, streams);
  return true;
}

/** Refresh host metrics for every active streaming server (panel + remote/LB). */
export async function syncAllServerHostMetrics(): Promise<{ synced: number; total: number }> {
  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  let synced = 0;
  for (const s of servers) {
    if (await syncServerHostMetrics(s.id)) synced++;
  }
  return { synced, total: servers.length };
}

/** Fire-and-forget refresh when dashboard reads stale remote metrics. */
export function scheduleServerHostMetricsSync(serverId: string): void {
  const last = sshAttemptAt.get(`dash:${serverId}`) ?? 0;
  if (Date.now() - last < SSH_RETRY_MS) return;
  sshAttemptAt.set(`dash:${serverId}`, Date.now());
  void syncServerHostMetrics(serverId).catch(() => {});
}
