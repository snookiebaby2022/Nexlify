import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/cache";
import { recordConnectionMediaBytes } from "@/lib/connection-quality-live";
import { trackConnection } from "@/lib/connections";

function ipMatchWhere(ip?: string | null) {
  const raw = ip?.trim() ?? "";
  if (raw) return { ip: raw };
  return { OR: [{ ip: null }, { ip: "" }] };
}

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

  const bytes = Math.max(0, Math.floor(opts.bytes ?? 0));

  if (bytes > 0) {
    await recordConnectionMediaBytes(lineId, streamId, opts.ip ?? "", bytes);
  }

  const result = await prisma.liveConnection.updateMany({
    where: { lineId, streamId, ...ipMatchWhere(opts.ip) },
    data: { lastSeenAt: new Date() },
  });

  if (result.count === 0) {
    await trackConnection({
      lineId,
      streamId,
      ip: opts.ip ?? "",
      userAgent: opts.userAgent,
      playbackPath: opts.playbackPath,
    });
  } else {
    void cacheDel("conn:*").catch(() => {});
  }
}
