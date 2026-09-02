import type { SessionUser } from "@/lib/auth";
import { listLiveConnections } from "@/lib/connections";
import { prisma } from "@/lib/prisma";
import { computeConnectionQualityWithLive, batchGetLiveQualitySamples } from "@/lib/connection-quality-live";
import { isConnectionQoeEnabled } from "@/lib/connection-qoe";
import {
  batchGetConnectionPlaybackOutputs,
  resolvePlaybackOutputLabel,
} from "@/lib/connection-playback-output";
import { streamServerDisplayName } from "@/lib/stream-server-display";
import { ownerScope } from "@/lib/owner-scope";

export type AdminConnectionRow = {
  id: string;
  lineId: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  streamStartedAt: string | null;
  lastSeenAt: string;
  serverName: string;
  line: { username: string; maxConnections: number; isRestreamer?: boolean };
  stream: { id: string; name: string; type: string } | null;
  quality: ReturnType<typeof computeConnectionQualityWithLive>;
  output: ReturnType<typeof resolvePlaybackOutputLabel>;
  qoe: { firstPictureMs: number | null; stallCount: number; mbps: number } | null;
};

export async function listAdminConnections(session: SessionUser): Promise<AdminConnectionRow[]> {
  const connections = await listLiveConnections(ownerScope(session));
  const streamIds = [...new Set(connections.map((c) => c.streamId).filter((id): id is string => Boolean(id)))];
  const processStartedById = new Map<string, Date>();
  const watchStartedById = new Map<string, Date>();
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
    for (const c of connections) {
      if (!c.streamId) continue;
      const watchStart = c.startedAt instanceof Date ? c.startedAt : new Date(c.startedAt);
      if (!Number.isFinite(watchStart.getTime())) continue;
      const prev = watchStartedById.get(c.streamId);
      if (!prev || watchStart < prev) watchStartedById.set(c.streamId, watchStart);
    }
  }
  const now = Date.now();
  const qualityItems = connections.map((c) => ({
    lineId: c.lineId,
    streamId: c.streamId ?? "",
    ip: c.ip,
  }));
  const outputItems = connections.map((c) => ({
    lineId: c.lineId,
    streamId: c.streamId ?? "",
    ip: c.ip,
  }));
  const [liveSamples, cachedOutputs] = await Promise.all([
    isConnectionQoeEnabled()
      ? batchGetLiveQualitySamples(qualityItems, now)
      : Promise.resolve(qualityItems.map(() => null)),
    batchGetConnectionPlaybackOutputs(outputItems),
  ]);
  return connections.map((c, i) => {
    const live = c.streamId ? liveSamples[i] : null;
    const quality = computeConnectionQualityWithLive({
      startedAt: c.startedAt,
      lastSeenAt: c.lastSeenAt,
      now,
      live,
    });
    const cachedOutput = c.streamId ? cachedOutputs[i] : null;
    const output = resolvePlaybackOutputLabel({
      cached: cachedOutput,
      userAgent: c.userAgent,
    });
    const startedMs = c.startedAt instanceof Date ? c.startedAt.getTime() : new Date(c.startedAt).getTime();
    const streamStarted = c.streamId
      ? (processStartedById.get(c.streamId) ?? watchStartedById.get(c.streamId) ?? null)
      : null;
    const qoe =
      live?.hasSamples
        ? {
            firstPictureMs:
              Number.isFinite(startedMs) && live.firstByteAt
                ? Math.max(0, live.firstByteAt - startedMs)
                : null,
            stallCount: live.stallCount ?? 0,
            mbps: Math.round((live.bytesPerSec * 8) / 10000) / 100,
          }
        : null;
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
      quality,
      output,
      qoe,
    };
  });
}
