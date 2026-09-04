import { StreamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, cacheDelExact } from "@/lib/cache";

const STREAK_NEEDED = 3;
const STREAK_TTL_SEC = 600;

async function bumpDashboard() {
  const { invalidateDashboardStats } = await import("@/lib/cache-invalidate");
  await invalidateDashboardStats().catch(() => {});
}

/** Viewer zap failures — never treat as origin dead. */
export async function markStreamViewerPlaybackFailed(streamId: string, detail: string): Promise<void> {
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
      lastViewerFailAt: new Date(),
      lastViewerError: labeled || "Viewer: playback failed",
    },
  });
  await bumpDashboard();
}

export async function markStreamViewerPlaybackOk(streamId: string): Promise<void> {
  const id = streamId?.trim();
  if (!id) return;
  await cacheDelExact(`viewer:probe:fail:${id}`).catch(() => {});
  await prisma.stream.updateMany({
    where: { id, type: "LIVE", isActive: true },
    data: { lastViewerFailAt: null, lastViewerError: null },
  });
}

export async function markStreamSpliceOk(streamId: string): Promise<void> {
  const id = streamId?.trim();
  if (!id) return;
  await prisma.stream.updateMany({
    where: { id, type: "LIVE", isActive: true },
    data: { lastSpliceOk: true, lastSpliceAt: new Date(), lastSpliceError: null },
  });
  await markStreamViewerPlaybackOk(id);
}

export async function markStreamSpliceFailed(streamId: string, detail: string): Promise<void> {
  const id = streamId?.trim();
  if (!id) return;
  const msg = String(detail ?? "splice failed").trim().slice(0, 500);
  const labeled = msg.startsWith("Splice:") ? msg : `Splice: ${msg}`;
  await prisma.stream.updateMany({
    where: { id, type: "LIVE", isActive: true },
    data: {
      lastSpliceOk: false,
      lastSpliceAt: new Date(),
      lastSpliceError: labeled,
    },
  });
  await bumpDashboard();
}

/** Origin + splice failures for dashboard Issues (excludes Viewer: stamps). */
export function liveOriginOrSpliceFailWhere() {
  return {
    type: StreamType.LIVE,
    isActive: true,
    OR: [
      {
        lastProbeOk: false,
        NOT: { lastProbeError: { startsWith: "Viewer:" } },
      },
      { lastSpliceOk: false },
    ],
  };
}
