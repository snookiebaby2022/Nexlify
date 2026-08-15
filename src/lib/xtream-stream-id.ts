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
 * When numeric, prefers streams on the given line's bouquets (SQL, no nested hydrate).
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
  if (!Number.isFinite(numericId)) return null;

  let lineId = opts?.lineId ?? null;
  if (!lineId && opts?.username) {
    const row = await prisma.line.findUnique({
      where: { username: opts.username },
      select: { id: true },
    });
    lineId = row?.id ?? null;
  }

  if (lineId) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT s.id AS id
      FROM "LineBouquet" lb
      INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE lb."lineId" = ${lineId}
        AND s."isActive" = true
    `;
    const match = rows.find((r) => cuidToNum(r.id) === numericId);
    if (match) return match.id;
  }

  // Bounded fallback when bouquet lookup misses (small panels / orphaned ids)
  const candidates = await prisma.stream.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 20_000,
    orderBy: { updatedAt: "desc" },
  });
  return candidates.find((s) => cuidToNum(s.id) === numericId)?.id ?? null;
}

/** True when the stream is on any bouquet assigned to the line. */
export async function lineHasStream(lineId: string, streamId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok
    FROM "LineBouquet" lb
    INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
    WHERE lb."lineId" = ${lineId}
      AND bs."streamId" = ${streamId}
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Episode stream ids for a series seed, scoped to the line's bouquets. */
export async function seriesEpisodeIdsForLine(
  lineId: string,
  seedId: string,
  seriesKey: string
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT s.id AS id
    FROM "LineBouquet" lb
    INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE lb."lineId" = ${lineId}
      AND s."isActive" = true
      AND s.type = 'SERIES'::"StreamType"
      AND (
        s.id = ${seedId}
        OR COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name) = ${seriesKey}
      )
    ORDER BY s.id ASC
  `;
  return rows.map((r) => r.id);
}
