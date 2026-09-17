import { prisma } from "@/lib/prisma";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";
import { normalizeConnectionIp } from "@/lib/connections";
import { setViewerActiveStream, touchLiveSession } from "@/lib/live-session";
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
  /** Skip SSE notify (batch path notifies once). */
  quiet?: boolean;
}): Promise<void> {
  try {
    await pulseLiveConnectionInner(opts);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // Heartbeats must never reject into batch Promise.allSettled noise / unhandledRejection.
    if (code === "P2002" || code === "P2003" || code === "P2025") return;
    console.error("[pulseLiveConnection]", code || (err instanceof Error ? err.message : err));
  }
}

async function pulseLiveConnectionInner(opts: {
  lineId: string;
  streamId: string;
  ip?: string | null;
  bytes?: number;
  idleMs?: number;
  onDemand?: boolean;
  userAgent?: string;
  playbackPath?: string;
  quiet?: boolean;
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
  if (bytes > 0) void markStreamSpliceOk(streamId);

  const [stream, line] = await Promise.all([
    prisma.stream.findUnique({
      where: { id: streamId },
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
    void touchLiveSession(lineId, streamId, clientIp || null);
    void setViewerActiveStream(lineId, streamId, clientIp || null);
    void refreshConnSlot(lineId, { streamId, clientIp });
    if (!opts.quiet) notifyLiveConnectionsChanged();
    return;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // Parallel pulses / live-auth zap already inserted this triple — just refresh.
    if (code === "P2002") {
      await prisma.liveConnection
        .updateMany({
          where: { lineId, streamId, ip: clientIp },
          data: { lastSeenAt: now },
        })
        .catch(() => undefined);
      void touchLiveSession(lineId, streamId, clientIp || null);
      void setViewerActiveStream(lineId, streamId, clientIp || null);
      void refreshConnSlot(lineId, { streamId, clientIp });
      if (!opts.quiet) notifyLiveConnectionsChanged();
      return;
    }
    /* Unique index may not be migrated yet — legacy path. */
  }

  const updated = await prisma.liveConnection.updateMany({
    where: { lineId, streamId, OR: [{ ip: clientIp }, ...(clientIp ? [] : [{ ip: "" }])] },
    data: { lastSeenAt: now },
  });
  if (updated.count > 0) {
    void touchLiveSession(lineId, streamId, clientIp || null);
    void setViewerActiveStream(lineId, streamId, clientIp || null);
    void refreshConnSlot(lineId, { streamId, clientIp });
    if (!opts.quiet) notifyLiveConnectionsChanged();
    return;
  }

  await prisma.liveConnection
    .create({
      data: { lineId, streamId, ip: clientIp },
    })
    .catch(() => undefined);
  void touchLiveSession(lineId, streamId, clientIp || null);
  void setViewerActiveStream(lineId, streamId, clientIp || null);
  void refreshConnSlot(lineId, { streamId, clientIp });
  if (!opts.quiet) notifyLiveConnectionsChanged();
}
