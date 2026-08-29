import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAgentConfigForServer } from "@/lib/stream-agent-config";
import {
  hostMetricsFromHeartbeat,
  persistHostMetrics,
  type HostMetricsSample,
} from "@/lib/host-metrics";
import { pushServerMetricsCache } from "@/lib/server-host-metrics-sync";
import { LIVE_STALE_MS } from "@/lib/connections";

export function generateAgentToken(): string {
  return randomBytes(32).toString("hex");
}

export async function getServerByAgentToken(token: string | null | undefined) {
  if (!token?.trim()) return null;
  return prisma.streamServer.findFirst({
    where: { agentToken: token.trim(), isActive: true },
  });
}

export async function enqueueAgentCommand(
  serverId: string,
  action: string,
  payload?: Record<string, unknown>
) {
  return prisma.agentCommand.create({
    data: {
      serverId,
      action,
      payload: payload ? (payload as Prisma.InputJsonValue) : undefined,
      status: "pending",
    },
  });
}

export async function bumpConfigRevision(serverId: string) {
  const server = await prisma.streamServer.update({
    where: { id: serverId },
    data: { configRevision: { increment: 1 } },
  });
  await enqueueAgentCommand(serverId, "apply_config", {
    revision: server.configRevision,
  });
  return server.configRevision;
}

export type HeartbeatProcess = {
  streamId?: string | null;
  pid?: number | null;
  name?: string | null;
  status?: string;
  cpuPercent?: number | null;
  memoryMb?: number | null;
  bitrateKbps?: number | null;
  errorMessage?: string | null;
};

function enrichHostMetricsSample(sample: HostMetricsSample, bandwidthMbps: number): HostMetricsSample {
  const cap = Math.max(1, bandwidthMbps);
  let uploadMbps = sample.uploadMbps;
  let downloadMbps = sample.downloadMbps;
  if (uploadMbps <= 0 && sample.upload > 0) uploadMbps = Math.round(((sample.upload / 100) * cap) * 10) / 10;
  if (downloadMbps <= 0 && sample.download > 0) downloadMbps = Math.round(((sample.download / 100) * cap) * 10) / 10;
  return { ...sample, uploadMbps, downloadMbps };
}

export async function handleAgentHeartbeat(
  serverId: string,
  data: {
    version?: string;
    processes?: HeartbeatProcess[];
    [key: string]: unknown;
  }
) {
  const now = new Date();
  const serverRow = await prisma.streamServer.update({
    where: { id: serverId },
    data: {
      agentLastSeen: now,
      agentVersion: typeof data.version === "string" ? data.version : undefined,
      healthStatus: "online",
      healthMessage: typeof data.version === "string" ? `Agent ${data.version}` : "Agent online",
      lastHealthAt: now,
    },
    select: { bandwidthMbps: true },
  });
  const hostSampleRaw = hostMetricsFromHeartbeat(data);
  if (hostSampleRaw) {
    const hostSample = enrichHostMetricsSample(hostSampleRaw, serverRow.bandwidthMbps ?? 1000);
    await persistHostMetrics(serverId, hostSample).catch(() => {});
    const liveBefore = new Date(Date.now() - LIVE_STALE_MS);
    const [connections, streams] = await Promise.all([
      prisma.liveConnection.count({
        where: { lastSeenAt: { gte: liveBefore }, stream: { serverId } },
      }),
      prisma.stream.count({ where: { serverId, isActive: true } }),
    ]);
    await pushServerMetricsCache(serverId, hostSample, connections, streams);
  }

  const processes = (Array.isArray(data.processes) ? data.processes : [])
    .slice(0, 200) as HeartbeatProcess[];
  if (processes.length > 0) {
    const candidateStreamIds = [
      ...new Set(
        processes
          .map((p) => p.streamId?.trim())
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const ownedStreamIds = new Set(
      candidateStreamIds.length
        ? (
            await prisma.stream.findMany({
              where: { id: { in: candidateStreamIds }, serverId },
              select: { id: true },
            })
          ).map((s) => s.id)
        : []
    );
    const scopedProcesses = processes.filter((p) => {
      const streamId = p.streamId?.trim();
      return streamId && ownedStreamIds.has(streamId);
    });

    // Batch update agentPid on streams assigned to this server
    const pidUpdates = scopedProcesses
      .filter((p) => p.pid != null && p.pid > 0 && p.streamId?.trim())
      .map((p) =>
        prisma.stream.updateMany({
          where: { id: p.streamId!.trim(), serverId },
          data: { agentPid: p.pid! },
        })
      );
    await Promise.all(pidUpdates);

    // Batch upsert stream processes
    const processData = scopedProcesses
      .filter((p) => p.streamId?.trim())
      .map((p) => ({
        serverId,
        streamId: p.streamId!.trim(),
        pid: p.pid ?? null,
        name: p.name ?? null,
        status: p.status ?? "running",
        cpuPercent: p.cpuPercent ?? null,
        memoryMb: p.memoryMb ?? null,
        bitrateKbps: p.bitrateKbps ?? null,
        errorMessage: p.errorMessage ?? null,
        lastSeenAt: now,
        startedAt: p.status === "running" ? now : undefined,
      }));

    // Use createMany with skipDuplicates, then update existing ones
    if (processData.length > 0) {
      await prisma.$transaction(
        processData.map((row) =>
          prisma.streamProcess.upsert({
            where: { serverId_streamId: { serverId: row.serverId, streamId: row.streamId } },
            create: {
              serverId: row.serverId,
              streamId: row.streamId,
              pid: row.pid,
              name: row.name,
              status: row.status,
              cpuPercent: row.cpuPercent,
              memoryMb: row.memoryMb,
              bitrateKbps: row.bitrateKbps,
              errorMessage: row.errorMessage,
              lastSeenAt: row.lastSeenAt,
              startedAt: row.startedAt,
            },
            update: {
              pid: row.pid,
              name: row.name,
              status: row.status,
              cpuPercent: row.cpuPercent,
              memoryMb: row.memoryMb,
              bitrateKbps: row.bitrateKbps,
              errorMessage: row.errorMessage,
              lastSeenAt: row.lastSeenAt,
            },
          })
        )
      );
    }
  }
}

export async function pollAgentCommands(serverId: string) {
  const server = await prisma.streamServer.findUnique({ where: { id: serverId } });
  if (!server) return { commands: [], config: null };

  const commands = await prisma.agentCommand.findMany({
    where: { serverId, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const config = await buildAgentConfigForServer(serverId, server.configRevision);
  return { commands, config };
}

export async function ackAgentCommand(
  commandId: string,
  serverId: string,
  ok: boolean,
  result?: string
) {
  return prisma.agentCommand.updateMany({
    where: { id: commandId, serverId },
    data: {
      status: ok ? "done" : "failed",
      result: result ?? null,
      completedAt: new Date(),
    },
  });
}
