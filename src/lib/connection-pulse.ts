import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/cache";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";
import {
  connectionIpPrismaFilter,
  normalizeConnectionIp,
} from "@/lib/connections";
import { getViewerActiveStream, touchLiveSession } from "@/lib/live-session";

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
  const qualityBytes = bytes > 0 ? bytes : 96_000;

  if (clientIp) {
    const active = await getViewerActiveStream(lineId, clientIp);
    if (active && active !== streamId) return;
  }

  void recordConnectionMediaBytes(lineId, streamId, clientIp ?? "", qualityBytes);
  void touchLiveSession(lineId, streamId, clientIp);

  let row = await prisma.liveConnection.findFirst({
    where: { lineId, streamId, ...connectionIpPrismaFilter(clientIp) },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true },
  });
  if (!row) {
    row = await prisma.liveConnection.findFirst({
      where: { lineId, streamId },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
  }

  if (row) {
    await prisma.liveConnection.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date(), ...(clientIp ? { ip: clientIp } : {}) },
    });
    void cacheDel("conn:*").catch(() => {});
    return;
  }

  // Row missing (race after zap) — upsert without pruning other streams.
  try {
    await prisma.liveConnection.create({
      data: {
        lineId,
        streamId,
        ip: clientIp ?? "",
        lastSeenAt: new Date(),
      },
    });
  } catch {
    /* concurrent insert — ignore */
  }
  void cacheDel("conn:*").catch(() => {});
}
