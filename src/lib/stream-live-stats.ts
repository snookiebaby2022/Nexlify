import { prisma } from "@/lib/prisma";

const STALE_MS = 5 * 60 * 1000;

export type StreamLiveStat = {
  viewers: number;
  uptimeSeconds: number | null;
  status: "online" | "offline" | "error";
  servers: { serverId: string; serverName: string; viewers: number; uptimeSeconds: number | null }[];
};

function uptimeFromStarted(startedAt: Date | null | undefined): number | null {
  if (!startedAt) return null;
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export { formatUptime };

export async function getStreamLiveStatsMap(
  streamIds: string[]
): Promise<Map<string, StreamLiveStat>> {
  const map = new Map<string, StreamLiveStat>();
  if (!streamIds.length) return map;

  const staleBefore = new Date(Date.now() - STALE_MS);
  const uniqueIds = [...new Set(streamIds)];

  const [connections, processes] = await Promise.all([
    prisma.liveConnection.findMany({
      where: { streamId: { in: uniqueIds }, lastSeenAt: { gte: staleBefore } },
      select: { streamId: true },
    }),
    prisma.streamProcess.findMany({
      where: { streamId: { in: uniqueIds }, lastSeenAt: { gte: staleBefore } },
      include: { server: { select: { id: true, name: true } } },
    }),
  ]);

  const viewersByStream = new Map<string, number>();
  for (const c of connections) {
    if (!c.streamId) continue;
    viewersByStream.set(c.streamId, (viewersByStream.get(c.streamId) ?? 0) + 1);
  }

  const processesByStream = new Map<string, typeof processes>();
  for (const p of processes) {
    if (!p.streamId) continue;
    const list = processesByStream.get(p.streamId) ?? [];
    list.push(p);
    processesByStream.set(p.streamId, list);
  }

  for (const id of uniqueIds) {
    const procs = processesByStream.get(id) ?? [];
    const running = procs.filter((p) => p.status === "running");
    const errored = procs.some((p) => p.status === "error" || p.errorMessage);
    const started = running
      .map((p) => p.startedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const uptimeSeconds = uptimeFromStarted(started);
    const servers = procs.map((p) => ({
      serverId: p.server.id,
      serverName: p.server.name,
      viewers: 0,
      uptimeSeconds: uptimeFromStarted(p.startedAt),
    }));
    const viewers = viewersByStream.get(id) ?? 0;
    const status: StreamLiveStat["status"] =
      errored ? "error" : running.length > 0 || viewers > 0 ? "online" : "offline";

    map.set(id, {
      viewers,
      uptimeSeconds,
      status,
      servers,
    });
  }

  return map;
}
