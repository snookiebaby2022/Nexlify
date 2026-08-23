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
  // Zero-byte keepalives must not refresh lastSeenAt or Redis — HLS idle close relies on that.
  if (bytes <= 0) return;

  if (clientIp) {
    const active = await getViewerActiveStream(lineId, clientIp);
    if (active && active !== streamId) return;
  }

  void recordConnectionMediaBytes(lineId, streamId, clientIp ?? "", bytes);
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
    void cacheDel("conn:*").catch(() => {});
    return;
  }

  // Edge pulse only refreshes rows opened by live-auth / trackConnection — never insert duplicates.
}
