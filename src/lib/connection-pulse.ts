import { prisma } from "@/lib/prisma";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";
import {
  connectionIpPrismaFilter,
  normalizeConnectionIp,
} from "@/lib/connections";
import { touchLiveSession } from "@/lib/live-session";
import { lineIsPlayable } from "@/lib/lines";

/** Edge / proxy heartbeat: refresh lastSeenAt and optional throughput samples. */
export async function pulseLiveConnection(opts: {
  lineId: string;
  streamId: string;
  ip?: string | null;
  bytes?: number;
  userAgent?: string;
  playbackPath?: string;
}): Promise<void> {
  const lineId = opts.lineId?.trim();
  const streamId = opts.streamId?.trim();
  if (!lineId || !streamId) return;

  const clientIp = normalizeConnectionIp(opts.ip);
  const bytes = Math.max(0, Math.floor(opts.bytes ?? 0));
  if (bytes > 0) {
    void recordConnectionMediaBytes(lineId, streamId, clientIp ?? "", bytes);
  }
  void touchLiveSession(lineId, streamId, clientIp);

  const row = await prisma.liveConnection.findFirst({
    where: { lineId, streamId, ...connectionIpPrismaFilter(clientIp) },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true },
  });

  if (row) {
    await prisma.liveConnection.updateMany({
      where: { id: row.id },
      data: { lastSeenAt: new Date(), ...(clientIp ? { ip: clientIp } : {}) },
    });
    return;
  }

  const [stream, line] = await Promise.all([
    prisma.stream.findFirst({
      where: { id: streamId, isActive: true },
      select: { id: true },
    }),
    prisma.line.findUnique({
      where: { id: lineId },
      select: { status: true, expiresAt: true },
    }),
  ]);
  if (!stream || !line || !lineIsPlayable(line)) return;

  await prisma.liveConnection.create({
    data: { lineId, streamId, ip: clientIp || null },
  }).catch(() => undefined);
}
