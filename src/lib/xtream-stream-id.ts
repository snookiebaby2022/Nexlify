import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cacheGetOrSet } from "@/lib/cache";
import { bouquetMembershipSql, leanVodMetaSkipSql } from "@/lib/lines";

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
  return cacheGetOrSet(`xtream:catresolve:${raw}`, 300, async () => {
    const numericId = parseInt(raw, 10);
    if (!Number.isFinite(numericId)) return null;
    const cats = await prisma.category.findMany({ select: { id: true }, take: 50_000 });
    return cats.find((c) => cuidToNum(c.id) === numericId)?.id ?? null;
  });
}

export type SeriesSeedRow = {
  id: string;
  name: string;
  streamIcon: string | null;
  categoryId: string | null;
  updatedAt: Date;
  vodRating?: string | null;
  vodPlot?: string | null;
};

function seriesSeedCategorySql(opts?: {
  categoryIds?: string[] | null;
  uncategorizedOnly?: boolean;
}): Prisma.Sql {
  if (opts?.uncategorizedOnly) {
    return Prisma.sql`AND (s."categoryId" IS NULL OR s."categoryId" = '')`;
  }
  if (opts?.categoryIds?.length) {
    return Prisma.sql`AND s."categoryId" IN (${Prisma.join(opts.categoryIds)})`;
  }
  return Prisma.empty;
}

const SERIES_SEED_SELECT = Prisma.sql`
  SELECT DISTINCT ON (lower(COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name)))
    s.id AS id,
    COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name) AS name,
    s."streamIcon" AS "streamIcon",
    s."categoryId" AS "categoryId",
    s."updatedAt" AS "updatedAt",
    ${leanVodMetaSkipSql}
`;

function seriesSeedFromSql(bouquetIds: string[], categorySql: Prisma.Sql) {
  return Prisma.sql`
    ${SERIES_SEED_SELECT}
    FROM ${bouquetMembershipSql(bouquetIds)} m
    INNER JOIN "Stream" s ON s.id = m."streamId"
    WHERE s."isActive" = true
      AND s.type = 'SERIES'::"StreamType"
      ${categorySql}
    ORDER BY
      lower(COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name)),
      CASE WHEN s."episodeNum" IS NULL OR s."episodeNum" = 0 THEN 0 ELSE 1 END,
      s.id ASC
  `;
}

/**
 * One Xtream "series" row per show (group episodes by seriesName).
 * Returning every episode as its own series (~400k) breaks XCIPTV login.
 */
export async function seriesSeedsForBouquets(
  bouquetIds: string[],
  opts?: {
    categoryIds?: string[] | null;
    uncategorizedOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<SeriesSeedRow[]> {
  if (!bouquetIds.length) return [];
  const categorySql = seriesSeedCategorySql(opts);
  const limit = opts?.limit != null ? Math.min(Math.max(1, opts.limit), 5000) : null;
  const offset = opts?.offset != null ? Math.max(0, opts.offset) : 0;
  if (limit != null) {
    return prisma.$queryRaw<SeriesSeedRow[]>`
      SELECT * FROM (${seriesSeedFromSql(bouquetIds, categorySql)}) seeds
      ORDER BY seeds.name ASC, seeds.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return prisma.$queryRaw<SeriesSeedRow[]>`${seriesSeedFromSql(bouquetIds, categorySql)}`;
}

export async function countSeriesSeedsForBouquets(
  bouquetIds: string[],
  opts?: { categoryIds?: string[] | null; uncategorizedOnly?: boolean }
): Promise<number> {
  if (!bouquetIds.length) return 0;
  const categorySql = seriesSeedCategorySql(opts);
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM (${seriesSeedFromSql(bouquetIds, categorySql)}) seeds
  `;
  return Number(rows[0]?.count ?? 0);
}

/** Cursor over distinct series so 400k shows never sit in one Node array. */
export async function forEachSeriesSeedBatch(
  bouquetIds: string[],
  opts: { categoryIds?: string[] | null; uncategorizedOnly?: boolean } | undefined,
  onBatch: (rows: SeriesSeedRow[]) => void | Promise<void>
): Promise<void> {
  if (!bouquetIds.length) return;
  const categorySql = seriesSeedCategorySql(opts);
  const { yieldEventLoop } = await import("@/lib/yield-event-loop");
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          DECLARE series_seed_cur NO SCROLL CURSOR FOR
          ${seriesSeedFromSql(bouquetIds, categorySql)}
        `;
        for (;;) {
          const rows = await tx.$queryRaw<SeriesSeedRow[]>`FETCH 3000 FROM series_seed_cur`;
          if (!rows.length) break;
          await onBatch(rows);
          if (rows.length < 3000) break;
          await yieldEventLoop();
        }
      },
      { maxWait: 20_000, timeout: 300_000 }
    );
  } catch (err) {
    console.warn(
      "[xtream] series cursor failed, paging instead:",
      err instanceof Error ? err.message : err
    );
    let offset = 0;
    for (;;) {
      const rows = await seriesSeedsForBouquets(bouquetIds, { ...opts, limit: 3000, offset });
      if (!rows.length) break;
      await onBatch(rows);
      if (rows.length < 3000) break;
      offset += rows.length;
      await yieldEventLoop();
    }
  }
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
  // Several rows can share a name; xtreamNum is per-row. Check every match so we
  // do not 404 a line that has a duplicate with the same numeric id.
  const byNumRows = await prisma.stream.findMany({
    where: { xtreamNum: numericId, isActive: true },
    select: { id: true },
    take: 8,
  });
  if (byNumRows.length) {
    if (!lineId) return byNumRows[0]!.id;
    for (const row of byNumRows) {
      if (await lineHasStream(lineId, row.id)) return row.id;
    }
    // This numeric id already maps to catalog rows this line cannot play.
    // Do not scan hundreds of thousands of bouquet rows hashing cuids (~4s 404s).
    return null;
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
  }

  // Do not scan hundreds of thousands of bouquet rows hashing cuids — that
  // stalls get_vod_info / movie play. Cron backfills Stream.xtreamNum.
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
    SELECT s.id AS id
    FROM "Stream" s
    WHERE s."isActive" = true
      AND s.type = 'SERIES'::"StreamType"
      AND (
        s.id = ${seedId}
        OR COALESCE(NULLIF(TRIM(s."seriesName"), ''), s.name) = ${seriesKey}
      )
      AND EXISTS (
        SELECT 1
        FROM "LineBouquet" lb
        INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
        WHERE lb."lineId" = ${lineId}
          AND bs."streamId" = s.id
      )
    ORDER BY
      COALESCE(s."seasonNum", 1) ASC,
      COALESCE(s."episodeNum", 1) ASC,
      s.id ASC
    LIMIT 1500
  `;
  return rows.map((r) => r.id);
}
