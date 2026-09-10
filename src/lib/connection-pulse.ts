import { prisma } from "@/lib/prisma";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";
import { normalizeConnectionIp } from "@/lib/connections";
import { touchLiveSession } from "@/lib/live-session";
import { markStreamSpliceOk } from "@/lib/viewer-playback-probe";
import { lineIsPlayable } from "@/lib/lines";
import { notifyLiveConnectionsChanged } from "@/lib/connection-live-bus";
import { refreshConnSlot } from "@/lib/connection-slots";

/** Edge / proxy heartbeat: refresh lastSeenAt and optional throughput samples. */
export async function pulseLiveConnection(opts: {
  lineId: string;
  streamId: string;
  ip?: string | null;
  bytes?: number;
  idleMs?: number;
  onDemand?: boolean;
  userAgent?: string;
  playbackPath?: string;
}): Promise<void> {
  const lineId = opts.lineId?.trim();
  const streamId = opts.streamId?.trim();
  if (!lineId || !streamId) return;

  const clientIp = normalizeConnectionIp(opts.ip) || "";
  const bytes = Math.max(0, Math.floor(opts.bytes ?? 0));
  const idleMs = Math.max(0, Math.floor(opts.idleMs ?? 0));
  const onDemand = Boolean(opts.onDemand);
  if (bytes > 0 || idleMs > 0) {
    void recordConnectionMediaBytes(lineId, streamId, clientIp, bytes, idleMs, onDemand);
  }
  void touchLiveSession(lineId, streamId, clientIp || null);
  if (bytes > 0) void markStreamSpliceOk(streamId);
  void refreshConnSlot(lineId, { streamId, clientIp });

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

  const now = new Date();
  try {
    await prisma.liveConnection.upsert({
      where: {
        lineId_streamId_ip: { lineId, streamId, ip: clientIp },
      },
      create: { lineId, streamId, ip: clientIp },
      update: { lastSeenAt: now },
    });
    notifyLiveConnectionsChanged();
    return;
  } catch {
    /* Unique index may not be migrated yet — legacy path. */
  }

  const updated = await prisma.liveConnection.updateMany({
    where: { lineId, streamId, OR: [{ ip: clientIp }, ...(clientIp ? [] : [{ ip: "" }])] },
    data: { lastSeenAt: now, ip: clientIp },
  });
  if (updated.count > 0) return;

  await prisma.liveConnection
    .create({
      data: { lineId, streamId, ip: clientIp },
    })
    .catch(() => undefined);
  notifyLiveConnectionsChanged();
}
