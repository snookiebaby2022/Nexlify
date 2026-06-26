import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getSettingGroup } from "@/lib/panel-settings";

export type TheftSettings = {
  enabled: boolean;
  sameIpLineThreshold: number;
  autoDisableLine: boolean;
  lookbackMinutes: number;
  vodTheftEnabled: boolean;
  vodSameIpLineThreshold: number;
  streamTheftEnabled: boolean;
  streamSameIpLineThreshold: number;
};

export async function loadTheftSettings(): Promise<TheftSettings> {
  const t = await getSettingGroup("theft");
  return {
    enabled: Boolean(t.enabled),
    sameIpLineThreshold: Number(t.sameIpLineThreshold ?? 3),
    autoDisableLine: Boolean(t.autoDisableLine),
    lookbackMinutes: Number(t.lookbackMinutes ?? 10),
    vodTheftEnabled: t.vodTheftEnabled !== false,
    vodSameIpLineThreshold: Number(t.vodSameIpLineThreshold ?? 2),
    streamTheftEnabled: t.streamTheftEnabled !== false,
    streamSameIpLineThreshold: Number(t.streamSameIpLineThreshold ?? 3),
  };
}

async function disableLines(lineIds: Iterable<string>) {
  for (const lineId of lineIds) {
    await prisma.line.updateMany({
      where: { id: lineId, status: "ACTIVE" },
      data: { status: "DISABLED" },
    });
  }
}

/** Multiple lines from one IP (live connections). */
export async function runLineTheftJob(settings: TheftSettings) {
  let alerts = 0;
  let disabled = 0;
  const staleBefore = new Date(Date.now() - settings.lookbackMinutes * 60 * 1000);
  const conns = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { gte: staleBefore }, ip: { not: null } },
    select: { ip: true, lineId: true },
  });
  const byIp = new Map<string, Set<string>>();
  for (const c of conns) {
    if (!c.ip) continue;
    if (!byIp.has(c.ip)) byIp.set(c.ip, new Set());
    byIp.get(c.ip)!.add(c.lineId);
  }
  for (const [ip, lines] of byIp) {
    if (lines.size < settings.sameIpLineThreshold) continue;
    alerts++;
    await prisma.activityLog.create({
      data: {
        action: "theft_detection_alert",
        entity: "ip",
        entityId: ip,
        meta: { lineCount: lines.size, lineIds: [...lines], kind: "lines" } as Prisma.InputJsonValue,
      },
    });
    if (settings.autoDisableLine) {
      await disableLines(lines);
      disabled += lines.size;
    }
  }
  return { alerts, disabled };
}

/** Same IP watching VOD (movies/series) on multiple lines. */
export async function runVodTheftJob(settings: TheftSettings) {
  let alerts = 0;
  let disabled = 0;
  const staleBefore = new Date(Date.now() - settings.lookbackMinutes * 60 * 1000);
  const conns = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { gte: staleBefore }, ip: { not: null } },
    select: { ip: true, lineId: true, streamId: true, stream: { select: { type: true } } },
  });
  const byIp = new Map<string, Set<string>>();
  for (const c of conns) {
    if (!c.ip || !c.stream) continue;
    if (c.stream.type !== "MOVIE" && c.stream.type !== "SERIES") continue;
    if (!byIp.has(c.ip)) byIp.set(c.ip, new Set());
    byIp.get(c.ip)!.add(c.lineId);
  }
  for (const [ip, lines] of byIp) {
    if (lines.size < settings.vodSameIpLineThreshold) continue;
    alerts++;
    await prisma.activityLog.create({
      data: {
        action: "theft_vod_alert",
        entity: "ip",
        entityId: ip,
        meta: { lineCount: lines.size, lineIds: [...lines], kind: "vod" } as Prisma.InputJsonValue,
      },
    });
    if (settings.autoDisableLine) {
      await disableLines(lines);
      disabled += lines.size;
    }
  }
  return { alerts, disabled };
}

/** Same IP pulls the same stream on multiple lines. */
export async function runStreamTheftJob(settings: TheftSettings) {
  let alerts = 0;
  let disabled = 0;
  const staleBefore = new Date(Date.now() - settings.lookbackMinutes * 60 * 1000);
  const conns = await prisma.liveConnection.findMany({
    where: { lastSeenAt: { gte: staleBefore }, ip: { not: null } },
    select: { ip: true, lineId: true, streamId: true },
  });
  const byIpStream = new Map<string, Set<string>>();
  for (const c of conns) {
    if (!c.ip || !c.streamId) continue;
    const key = `${c.ip}::${c.streamId}`;
    if (!byIpStream.has(key)) byIpStream.set(key, new Set());
    byIpStream.get(key)!.add(c.lineId);
  }
  for (const [key, lines] of byIpStream) {
    if (lines.size < settings.streamSameIpLineThreshold) continue;
    const [ip, streamId] = key.split("::");
    alerts++;
    await prisma.activityLog.create({
      data: {
        action: "theft_stream_alert",
        entity: "stream",
        entityId: streamId,
        meta: { ip, lineCount: lines.size, lineIds: [...lines], kind: "stream" } as Prisma.InputJsonValue,
      },
    });
    if (settings.autoDisableLine) {
      await disableLines(lines);
      disabled += lines.size;
    }
  }
  return { alerts, disabled };
}
