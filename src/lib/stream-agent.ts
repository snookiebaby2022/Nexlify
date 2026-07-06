import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAgentConfigForServer } from "@/lib/stream-agent-config";

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

export async function handleAgentHeartbeat(
  serverId: string,
  data: {
    version?: string;
    processes?: HeartbeatProcess[];
  }
) {
  const now = new Date();
  await prisma.streamServer.update({
    where: { id: serverId },
    data: {
      agentLastSeen: now,
      agentVersion: data.version ?? undefined,
      healthStatus: "online",
      healthMessage: data.version ? `Agent ${data.version}` : "Agent online",
      lastHealthAt: now,
    },
  });

  const processes = data.processes ?? [];
  if (processes.length > 0) {
    // Batch update agentPid on streams
    const pidUpdates = processes
      .filter((p) => p.pid != null && p.pid > 0 && p.streamId?.trim())
      .map((p) =>
        prisma.stream.update({
          where: { id: p.streamId!.trim() },
          data: { agentPid: p.pid! },
        })
      );
    await Promise.all(pidUpdates);

    // Batch upsert stream processes
    const processData = processes
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
            where: { serverId_streamId: { serverId: row.streamId } },
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
