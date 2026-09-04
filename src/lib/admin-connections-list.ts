import type { SessionUser } from "@/lib/auth";
import { listLiveConnections } from "@/lib/connections";
import { prisma } from "@/lib/prisma";
import { computeConnectionQualityWithLive } from "@/lib/connection-quality-live";
import {
  batchGetConnectionPlaybackOutputs,
  resolvePlaybackOutputLabel,
} from "@/lib/connection-playback-output";
import { streamServerDisplayName } from "@/lib/stream-server-display";
import { ownerLineOwnerIds } from "@/lib/owner-scope";

export type AdminConnectionRow = {
  id: string;
  lineId: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  streamStartedAt: string | null;
  lastSeenAt: string;
  serverName: string;
  line: {
    username: string;
    maxConnections: number;
    isRestreamer?: boolean;
    magDevices?: { mac: string }[];
  };
  stream: { id: string; name: string; type: string; serverId?: string | null } | null;
  quality: ReturnType<typeof computeConnectionQualityWithLive>;
  output: ReturnType<typeof resolvePlaybackOutputLabel>;
};

export async function listAdminConnections(
  session: SessionUser,
  _opts?: { includeQoe?: boolean }
): Promise<AdminConnectionRow[]> {
  const connections = await listLiveConnections(await ownerLineOwnerIds(session));
  const streamIds = [...new Set(connections.map((c) => c.streamId).filter((id): id is string => Boolean(id)))];
  const processStartedById = new Map<string, Date>();
  if (streamIds.length) {
    const processes = await prisma.streamProcess.findMany({
      where: { streamId: { in: streamIds }, status: "running", startedAt: { not: null } },
      select: { streamId: true, startedAt: true },
    });
    for (const p of processes) {
      if (!p.streamId || !p.startedAt) continue;
      const prev = processStartedById.get(p.streamId);
      if (!prev || p.startedAt < prev) processStartedById.set(p.streamId, p.startedAt);
    }
  }
  const now = Date.now();
  const outputItems = connections.map((c) => ({
    lineId: c.lineId,
    streamId: c.streamId ?? "",
    ip: c.ip,
  }));
  const cachedOutputs = await batchGetConnectionPlaybackOutputs(outputItems);
  return connections.map((c, i) => {
    const quality = computeConnectionQualityWithLive({
      startedAt: c.startedAt,
      lastSeenAt: c.lastSeenAt,
      now,
      live: null,
    });
    const cachedOutput = c.streamId ? cachedOutputs[i] : null;
    const output = resolvePlaybackOutputLabel({
      cached: cachedOutput,
      userAgent: c.userAgent,
    });
    const streamStarted = c.streamId ? (processStartedById.get(c.streamId) ?? null) : null;
    const srv = c.stream?.server;
    const serverName = srv
      ? streamServerDisplayName(srv.name, srv.domain || srv.host || "")
      : "Main Server";
    return {
      ...c,
      startedAt: c.startedAt instanceof Date ? c.startedAt.toISOString() : String(c.startedAt),
      streamStartedAt: streamStarted ? streamStarted.toISOString() : null,
      lastSeenAt: c.lastSeenAt instanceof Date ? c.lastSeenAt.toISOString() : String(c.lastSeenAt),
      serverName,
      stream: c.stream
        ? { id: c.stream.id, name: c.stream.name, type: c.stream.type, serverId: c.stream.serverId }
        : null,
      quality,
      output,
    };
  });
}
