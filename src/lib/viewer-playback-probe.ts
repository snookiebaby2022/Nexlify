import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, cacheDelExact } from "@/lib/cache";

const STREAK_NEEDED = 3;
const STREAK_TTL_SEC = 600;

/** Mark a live stream failed after repeated real viewer zaps, not a single glitch. */
export async function markStreamViewerPlaybackFailed(
  streamId: string,
  detail: string
): Promise<void> {
  const id = streamId?.trim();
  if (!id) return;
  const key = `viewer:probe:fail:${id}`;
  const prev = Number((await cacheGet<number | string>(key)) ?? 0);
  const streak = prev + 1;
  await cacheSet(key, streak, STREAK_TTL_SEC);
  if (streak < STREAK_NEEDED) return;
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
  await cacheDelExact(`viewer:probe:fail:${id}`).catch(() => {});
  await prisma.stream.updateMany({
    where: { id, type: "LIVE", isActive: true, lastProbeOk: false },
    data: {
      lastProbeOk: true,
      lastProbeAt: new Date(),
      lastProbeError: null,
    },
  });
}
