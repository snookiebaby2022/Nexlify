import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/cache";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";
import {
  connectionIpPrismaFilter,
  normalizeConnectionIp,
  trackConnection,
} from "@/lib/connections";

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

  await recordConnectionMediaBytes(lineId, streamId, clientIp ?? "", qualityBytes);

  const result = await prisma.liveConnection.updateMany({
    where: { lineId, streamId, ...connectionIpPrismaFilter(clientIp) },
    data: { lastSeenAt: new Date() },
  });

  if (result.count === 0) {
    await trackConnection({
      lineId,
      streamId,
      ip: clientIp ?? undefined,
      userAgent: opts.userAgent,
      playbackPath: opts.playbackPath,
      mediaBytes: qualityBytes,
    });
  } else {
    void cacheDel("conn:*").catch(() => {});
  }
}
