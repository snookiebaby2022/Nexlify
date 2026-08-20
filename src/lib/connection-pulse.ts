import { prisma } from "@/lib/prisma";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";

/** Edge / proxy heartbeat: refresh lastSeenAt and optional throughput samples. */
export async function pulseLiveConnection(opts: {
  lineId: string;
  streamId: string;
  ip?: string | null;
  bytes?: number;
}): Promise<void> {
  const lineId = opts.lineId?.trim();
  const streamId = opts.streamId?.trim();
  if (!lineId || !streamId) return;

  const ip = opts.ip ?? null;
  const bytes = Math.max(0, Math.floor(opts.bytes ?? 0));

  if (bytes > 0) {
    await recordConnectionMediaBytes(lineId, streamId, ip ?? "", bytes);
  }

  await prisma.liveConnection.updateMany({
    where: { lineId, streamId, ip: ip ?? null },
    data: { lastSeenAt: new Date() },
  });
}
