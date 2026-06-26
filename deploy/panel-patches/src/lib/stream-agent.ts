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
  for (const p of processes) {
    const streamId = p.streamId?.trim() || null;
    if (!streamId) continue;

    const row = {
      pid: p.pid ?? null,
      name: p.name ?? null,
      status: p.status ?? "running",
      cpuPercent: p.cpuPercent ?? null,
      memoryMb: p.memoryMb ?? null,
      bitrateKbps: p.bitrateKbps ?? null,
      errorMessage: p.errorMessage ?? null,
      lastSeenAt: now,
    };

    const existing = await prisma.streamProcess.findUnique({
      where: { serverId_streamId: { serverId, streamId } },
    });
    if (p.pid != null && p.pid > 0) {
      await prisma.stream.update({
        where: { id: streamId },
        data: { agentPid: p.pid },
      });
    }

    if (existing) {
      await prisma.streamProcess.update({
        where: { id: existing.id },
        data: row,
      });
    } else {
      await prisma.streamProcess.create({
        data: {
          serverId,
          streamId,
          ...row,
          startedAt: row.status === "running" ? now : undefined,
        },
      });
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
