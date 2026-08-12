import { prisma } from "@/lib/prisma";

/** Stable numeric id for Xtream-compatible APIs (matches historical live/movie routes). */
export function cuidToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Resolve playback/API stream id: accepts cuid or Xtream numeric hash.
 * When numeric, prefers streams on the given line's bouquets.
 */
export async function resolveStreamIdParam(
  streamIdParam: string,
  opts?: { username?: string; lineId?: string }
): Promise<string | null> {
  const raw = streamIdParam.replace(/\.(ts|m3u8|mp4|mkv|avi|mov|webm)$/i, "").trim();
  if (!raw) return null;

  if (!/^\d+$/.test(raw)) {
    const exists = await prisma.stream.findUnique({ where: { id: raw }, select: { id: true } });
    return exists?.id ?? raw;
  }

  const numericId = parseInt(raw, 10);

  if (opts?.username || opts?.lineId) {
    const line = opts.lineId
      ? await prisma.line.findUnique({
          where: { id: opts.lineId },
          include: {
            bouquets: {
              include: {
                bouquet: { include: { streams: { include: { stream: { select: { id: true } } } } } },
              },
            },
          },
        })
      : await prisma.line.findUnique({
          where: { username: opts.username! },
          include: {
            bouquets: {
              include: {
                bouquet: { include: { streams: { include: { stream: { select: { id: true } } } } } },
              },
            },
          },
        });

    if (line) {
      const allIds = line.bouquets.flatMap((lb) => lb.bouquet.streams.map((bs) => bs.stream.id));
      const match = allIds.find((id) => cuidToNum(id) === numericId);
      if (match) return match;
    }
  }

  // Fallback: scan active streams (bounded) when bouquet lookup misses
  const candidates = await prisma.stream.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 50_000,
  });
  return candidates.find((s) => cuidToNum(s.id) === numericId)?.id ?? null;
}
