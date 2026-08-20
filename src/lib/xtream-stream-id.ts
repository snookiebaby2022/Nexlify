import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Stable numeric id for Xtream-compatible APIs (matches historical live/movie routes). */
export function cuidToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Xtream category_id: numeric string for XCIPTV / XUI apps (cuid hashed). */
export function xtreamCategoryId(categoryId: string | null | undefined): string {
  if (!categoryId) return "0";
  return String(cuidToNum(categoryId));
}

/**
 * Resolve category_id from Xtream clients: accepts cuid or numeric hash.
 * Categories are few — bounded scan is fine.
 */
export async function resolveCategoryIdParam(categoryId: string): Promise<string | null> {
  const raw = String(categoryId ?? "").trim();
  if (!raw || raw === "0") return raw === "0" ? "0" : null;
  if (!/^\d+$/.test(raw)) {
    const exists = await prisma.category.findUnique({ where: { id: raw }, select: { id: true } });
    return exists?.id ?? null;
  }
  const numericId = parseInt(raw, 10);
  if (!Number.isFinite(numericId)) return null;
  const cats = await prisma.category.findMany({ select: { id: true }, take: 50_000 });
  return cats.find((c) => cuidToNum(c.id) === numericId)?.id ?? null;
}

export type SeriesSeedRow = {
  id: string;
  name: string;
  streamIcon: string | null;
  categoryId: string | null;
  updatedAt: Date;
};

/**
 * One Xtream "series" row per show (group episodes by seriesName).
 * Returning every episode as its own series (~400k) breaks XCIPTV login.
 */
export async function seriesSeedsForBouquets(
  bouquetIds: string[],
  opts?: { categoryIds?: string[] | null; uncategorizedOnly?: boolean }
): Promise<SeriesSeedRow[]> {
  if (!bouquetIds.length) return [];

  let categorySql: Prisma.Sql = Prisma.empty;
  if (opts?.uncategorizedOnly) {
    categorySql = Prisma.sql`AND s."categoryId" IS NULL`;
  } else if (opts?.categoryIds?.length) {
    categorySql = Prisma.sql`AND s."categoryId" IN (${Prisma.join(opts.categoryIds)})`;
  }

  return prisma.$queryRaw<SeriesSeedRow[]>`
    SELECT DISTINCT ON (lower(COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name)))
      s.id AS id,
      COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name) AS name,
      s."streamIcon" AS "streamIcon",
      s."categoryId" AS "categoryId",
      s."updatedAt" AS "updatedAt"
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
      AND s."isActive" = true
      AND s.type = 'SERIES'::"StreamType"
      ${categorySql}
    ORDER BY
      lower(COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name)),
      CASE WHEN s."episodeNum" IS NULL OR s."episodeNum" = 0 THEN 0 ELSE 1 END,
      s.id ASC
  `;
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

  // Fast path: indexed xtreamNum (populated by backfill / stream create).
  const byNum = await prisma.stream.findFirst({
    where: { xtreamNum: numericId, isActive: true },
    select: { id: true },
  });
  if (byNum) {
    if (lineId) {
      const allowed = await lineHasStream(lineId, byNum.id);
      if (allowed) return byNum.id;
    } else {
      return byNum.id;
    }
  }

  if (lineId) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT s.id AS id
      FROM "LineBouquet" lb
      INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE lb."lineId" = ${lineId}
        AND s."isActive" = true
        AND s."xtreamNum" = ${numericId}
      LIMIT 1
    `;
    if (rows[0]?.id) return rows[0].id;

    // XCIPTV uses numeric stream_id — scan this line's bouquets in batches (no full-table load).
    const BATCH = 8000;
    for (let offset = 0; offset < 500_000; offset += BATCH) {
      const batch = await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT s.id AS id
        FROM "LineBouquet" lb
        INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
        INNER JOIN "Stream" s ON s.id = bs."streamId"
        WHERE lb."lineId" = ${lineId}
          AND s."isActive" = true
        ORDER BY s.id ASC
        LIMIT ${BATCH} OFFSET ${offset}
      `;
      if (!batch.length) break;
      const match = batch.find((r) => cuidToNum(r.id) === numericId);
      if (match) {
        void prisma.stream
          .update({ where: { id: match.id }, data: { xtreamNum: numericId } })
          .catch(() => {});
        return match.id;
      }
      if (batch.length < BATCH) break;
    }
  }

  // Legacy fallback before backfill completes — bounded scan only.
  const candidates = await prisma.stream.findMany({
    where: { isActive: true, xtreamNum: null },
    select: { id: true },
    take: 5_000,
    orderBy: { updatedAt: "desc" },
  });
  const legacy = candidates.find((s) => cuidToNum(s.id) === numericId)?.id ?? null;
  if (legacy) {
    void prisma.stream.update({ where: { id: legacy }, data: { xtreamNum: numericId } }).catch(() => {});
    return legacy;
  }

  return null;
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
