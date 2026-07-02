import { prisma } from "@/lib/prisma";
import {
  getStreamPlaybackMode,
  type StreamPlaybackMode,
  type StreamForPlaybackMode,
} from "@/lib/stream-playback-mode";

const STALE_MS = 5 * 60 * 1000;

export type StreamLiveStat = {
  viewers: number;
  uptimeSeconds: number | null;
  status: "online" | "offline" | "error" | "direct" | "ready";
  displayStatus: string;
  playbackMode: StreamPlaybackMode;
  servers: { serverId: string; serverName: string; viewers: number; uptimeSeconds: number | null }[];
};

export type StreamStatsInput = StreamForPlaybackMode & {
  id: string;
  isActive: boolean;
  lastProbeOk: boolean | null;
};

function uptimeFromStarted(startedAt: Date | null | undefined): number | null {
  if (!startedAt) return null;
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
}

export function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** XUI-style uptime: 00h 19m 45s */
export function formatUptimeXui(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function resolveDisplayStatus(
  stream: StreamStatsInput,
  errored: boolean,
  running: boolean,
  viewers: number,
  playbackMode: StreamPlaybackMode
): { status: StreamLiveStat["status"]; displayStatus: string } {
  if (!stream.isActive) {
    return { status: "offline", displayStatus: "Off" };
  }
  if (errored) {
    return { status: "error", displayStatus: "Error" };
  }
  if (running || viewers > 0) {
    return { status: "online", displayStatus: "Online" };
  }

  if (playbackMode === "direct") {
    if (stream.lastProbeOk === false) {
      return { status: "offline", displayStatus: "Source down" };
    }
    return { status: "direct", displayStatus: "Direct" };
  }

  if (playbackMode === "on_demand" || playbackMode === "created" || playbackMode === "catchup") {
    if (stream.lastProbeOk === false) {
      return { status: "offline", displayStatus: "Standby" };
    }
    return { status: "ready", displayStatus: "Ready" };
  }

  return { status: "offline", displayStatus: "Offline" };
}

export async function getStreamLiveStatsMap(
  streams: StreamStatsInput[]
): Promise<Map<string, StreamLiveStat>> {
  const map = new Map<string, StreamLiveStat>();
  if (!streams.length) return map;

  const staleBefore = new Date(Date.now() - STALE_MS);
  const uniqueIds = [...new Set(streams.map((s) => s.id))];

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

  for (const stream of streams) {
    const id = stream.id;
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
    const playbackMode = getStreamPlaybackMode(stream);
    const { status, displayStatus } = resolveDisplayStatus(
      stream,
      errored,
      running.length > 0,
      viewers,
      playbackMode
    );

    map.set(id, {
      viewers,
      uptimeSeconds,
      status,
      displayStatus,
      playbackMode,
      servers,
    });
  }

  return map;
}
