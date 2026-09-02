import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const DEBOUNCE_SEC = 600;

/** Mark a live stream failed after a real viewer zap (IPTV app), not background cron probes. */
export async function markStreamViewerPlaybackFailed(
  streamId: string,
  detail: string
): Promise<void> {
  const id = streamId?.trim();
  if (!id) return;
  const key = `viewer:probe:fail:${id}`;
  if (await cacheGet<string>(key)) return;
  await cacheSet(key, "1", DEBOUNCE_SEC);
  const msg = String(detail ?? "Viewer playback failed").trim().slice(0, 500);
  const labeled = msg.startsWith("Viewer:") ? msg : `Viewer: ${msg}`;
  await prisma.stream.updateMany({
    where: { id, type: "LIVE", isActive: true },
    data: {
      lastProbeOk: false,
      lastProbeAt: new Date(),
      lastProbeError: labeled || "Viewer: playback failed",
    },
  });
}

/** Viewer playback succeeded — clear a prior viewer-failure flag. */
export async function markStreamViewerPlaybackOk(streamId: string): Promise<void> {
  const id = streamId?.trim();
  if (!id) return;
  await prisma.stream.updateMany({
    where: { id, type: "LIVE", isActive: true, lastProbeOk: false },
    data: {
      lastProbeOk: true,
      lastProbeAt: new Date(),
      lastProbeError: null,
    },
  });
}
