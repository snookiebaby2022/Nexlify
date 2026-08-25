import { LineStatus, Prisma, StreamType, type Line, type Stream } from "@prisma/client";
import { createHash } from "crypto";

export type { Line };
import { prisma } from "./prisma";
import { cacheGetOrSet } from "./cache";
import { yieldEventLoop } from "./yield-event-loop";
import { listVodNewestFirst } from "./stream-order";

function lineCredCacheKey(username: string, password: string) {
  const digest = createHash("sha256").update(`${username}\0${password}`).digest("hex").slice(0, 20);
  return `line:cred:${username}:${digest}`;
}

/** Auth / listing include — bouquets only, never nested BouquetStream rows (can be 100k+). */
export const lineAuthInclude = {
  bouquets: {
    include: {
      bouquet: true,
    },
  },
} as const;

export type LineWithBouquets = Prisma.LineGetPayload<{
  include: typeof lineAuthInclude;
}>;

/** Nested shape used by a few admin export paths that already loaded streams. */
export type LineWithNestedBouquetStreams = Prisma.LineGetPayload<{
  include: {
    bouquets: {
      include: {
        bouquet: {
          include: {
            streams: {
              include: {
                stream: true;
              };
            };
          };
        };
      };
    };
  };
}>;

function reviveLineDates<T extends Pick<Line, "expiresAt" | "createdAt" | "updatedAt">>(line: T): T {
  return {
    ...line,
    expiresAt: coerceDate(line.expiresAt) ?? line.expiresAt,
    createdAt: coerceDate(line.createdAt) ?? line.createdAt,
    updatedAt: coerceDate(line.updatedAt) ?? line.updatedAt,
  };
}

export async function getLineByCredentials(
  username: string,
  password: string
): Promise<LineWithBouquets | null> {
  const line = await cacheGetOrSet(lineCredCacheKey(username, password), 45, async () => {
    const row = await prisma.line.findUnique({
      where: { username },
      include: lineAuthInclude,
    });
    if (row && row.password === password) return row;

    const code = username.trim().toUpperCase();
    if (!code) return null;

    const activeLine = await prisma.line.findFirst({
      where: { activeCode: code, authMode: "ACTIVE_CODE" },
      include: lineAuthInclude,
    });
    if (!activeLine) return null;
    if (password && password !== activeLine.password && password !== code) return null;
    return activeLine;
  });
  return line ? reviveLineDates(line) : null;
}

function coerceDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function effectiveLineStatus(line: Pick<Line, "status" | "expiresAt">): LineStatus {
  if (line.status === LineStatus.BANNED || line.status === LineStatus.DISABLED) {
    return line.status;
  }
  const expiresAt = coerceDate(line.expiresAt);
  if (expiresAt && expiresAt < new Date()) return LineStatus.EXPIRED;
  return line.status;
}

export function lineIsPlayable(line: Pick<Line, "status" | "expiresAt">) {
  return effectiveLineStatus(line) === LineStatus.ACTIVE;
}

export function activeBouquetIds(line: LineWithBouquets, excludeDisabled = true): string[] {
  return line.bouquets
    .filter((lb) => !excludeDisabled || lb.bouquet.isActive)
    .map((lb) => lb.bouquet.id);
}

/** Stable cache token so 4k lines on the same bouquets share one catalog blob. */
export function lineBouquetCacheToken(line: LineWithBouquets, excludeDisabled = true): string {
  return [...activeBouquetIds(line, excludeDisabled)].sort().join(",");
}

export type StreamForLine = Stream & {
  provider?: { baseUrl?: string | null } | null;
  server?: { host?: string | null } | null;
  /** Category display name for XUI-style M3U group-title. */
  categoryName?: string | null;
  /** File extension parsed from streamUrl (lean catalog SQL). */
  urlExt?: string | null;
  /** TMDB/XUI rating scraped from agentStartCmd (lean catalog SQL). */
  vodRating?: string | null;
  vodPlot?: string | null;
};

/**
 * Rating + plot from agentStartCmd without hydrating the full JSON blob.
 * PostgreSQL POSIX `{m,n}` is capped at 255 — `{0,800}` throws 2201B
 * (invalid repetition count) and 500s every XCIPTV catalog + Smarters get.php.
 */
export const leanVodMetaSql = Prisma.sql`
      CASE WHEN s.type::text IN ('MOVIE', 'SERIES') THEN
        COALESCE(
          (regexp_match(left(COALESCE(s."agentStartCmd", ''), 4000), '"tmdbRating"[[:space:]]*:[[:space:]]*"?([0-9]+(\\.[0-9]+)?)"?'))[1],
          (regexp_match(left(COALESCE(s."agentStartCmd", ''), 4000), '"rating"[[:space:]]*:[[:space:]]*"?([0-9]+(\\.[0-9]+)?)"?'))[1]
        )
      ELSE NULL END AS "vodRating",
      CASE WHEN s.type::text IN ('MOVIE', 'SERIES') THEN
        left(
          COALESCE(
            (regexp_match(left(COALESCE(s."agentStartCmd", ''), 4000), '"tmdbOverview"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1],
            (regexp_match(left(COALESCE(s."agentStartCmd", ''), 4000), '"plot"[[:space:]]*:[[:space:]]*"([^"]*)"'))[1]
          ),
          400
        )
      ELSE NULL END AS "vodPlot"`;

/** Catalog gzip builds skip 4× regexp_match per row — ratings stay on existing blobs until rebuild. */
export const leanVodMetaSkipSql = Prisma.sql`
      NULL::text AS "vodRating",
      NULL::text AS "vodPlot"`;

function vodMetaSelectSql(options?: StreamsForLineOptions) {
  return options?.skipVodMeta === true ? leanVodMetaSkipSql : leanVodMetaSql;
}

export type StreamsForLineOptions = {
  excludeDisabled?: boolean;
  type?: StreamType | StreamType[];
  /** When set, only streams in these category IDs (use null sentinel via uncategorizedOnly). */
  categoryIds?: string[] | null;
  /** When true, only streams with no category (NULL or empty). */
  uncategorizedOnly?: boolean;
  /** Skip TMDB rating/plot regex on agentStartCmd (Xtream catalog blob speed). */
  skipVodMeta?: boolean;
  /** Skip provider/server joins (enough for M3U live paths and listings). */
  lean?: boolean;
  /** Process streams in ordered batches without holding the full catalog in RAM. */
  onBatch?: (streams: StreamForLine[]) => void | Promise<void>;
  /** Pagination for Stalker get_ordered_list (Ministra page size). */
  offset?: number;
  limit?: number;
};

const STREAM_BATCH = 4000;

/** Listing columns only — skip streamUrl/backupUrl/playlistUrl (often huge) on live catalogs. */
const LEAN_LISTING_SELECT = {
  id: true,
  name: true,
  type: true,
  streamIcon: true,
  epgChannelId: true,
  channelId: true,
  createdAt: true,
  updatedAt: true,
  categoryId: true,
  vodMode: true,
  archiveDays: true,
  timeshiftSeconds: true,
  isShifted: true,
  isAdult: true,
  isActive: true,
  sortOrder: true,
  containerExtension: true,
} as const;

function leanStreamSelect(_options?: StreamsForLineOptions) {
  return LEAN_LISTING_SELECT;
}

async function loadStreamChunk(
  chunkIds: string[],
  options?: StreamsForLineOptions
): Promise<StreamForLine[]> {
  const lean = options?.lean === true;
  const rows = lean
    ? await prisma.stream.findMany({
        where: { id: { in: chunkIds } },
        select: {
          ...leanStreamSelect(options),
          category: { select: { name: true } },
        },
      })
    : await prisma.stream.findMany({
        where: { id: { in: chunkIds } },
        include: {
          provider: { select: { baseUrl: true } },
          server: { select: { host: true } },
          category: { select: { name: true } },
        },
      });
  const byId = new Map(
    rows.map((s) => {
      const { category, ...rest } = s as typeof s & { category?: { name: string } | null };
      return [s.id, { ...rest, categoryName: category?.name ?? null } as StreamForLine];
    })
  );
  return chunkIds.map((id) => byId.get(id)).filter((s): s is StreamForLine => Boolean(s));
}

function listingPlayableSql() {
  return Prisma.sql`AND (s."streamUrl" IS NULL OR s."streamUrl" NOT LIKE 'pending://%')`;
}

/** Indexed membership for a line's bouquets — avoids a 981k BouquetStream join. */
export function bouquetMembershipSql(bouquetIds: string[]) {
  return Prisma.sql`(
    SELECT DISTINCT bs."streamId" AS "streamId"
    FROM "BouquetStream" bs
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
  )`;
}

function typeList(options?: StreamsForLineOptions): StreamType[] | null {
  if (!options?.type) return null;
  return Array.isArray(options.type) ? options.type : [options.type];
}

function listingUsesNewestFirst(options?: StreamsForLineOptions): boolean {
  return listVodNewestFirst(typeList(options));
}

function listingOrderSql(options?: StreamsForLineOptions) {
  if (listingUsesNewestFirst(options)) {
    return Prisma.sql`ORDER BY s."createdAt" DESC, s.id DESC`;
  }
  return Prisma.sql`ORDER BY s."sortOrder" ASC, s.name ASC, s.id ASC`;
}

type ListingCursor =
  | { kind: "order"; sortOrder: number; name: string; id: string }
  | { kind: "newest"; createdAt: Date; id: string };

function listingCursorSql(cursor: ListingCursor | null): Prisma.Sql {
  if (!cursor) return Prisma.empty;
  if (cursor.kind === "newest") {
    return Prisma.sql`AND (
      s."createdAt" < ${cursor.createdAt}
      OR (s."createdAt" = ${cursor.createdAt} AND s.id < ${cursor.id})
    )`;
  }
  return Prisma.sql`AND (
    s."sortOrder" > ${cursor.sortOrder}
    OR (s."sortOrder" = ${cursor.sortOrder} AND s.name > ${cursor.name})
    OR (s."sortOrder" = ${cursor.sortOrder} AND s.name = ${cursor.name} AND s.id > ${cursor.id})
  )`;
}

type LeanListingRow = {
  id: string;
  name: string;
  type: StreamType;
  streamIcon: string | null;
  epgChannelId: string | null;
  channelId: string | null;
  createdAt: Date;
  updatedAt: Date;
  categoryId: string | null;
  vodMode: Stream["vodMode"];
  archiveDays: number | null;
  timeshiftSeconds: number | null;
  isShifted: boolean;
  isAdult: boolean;
  isActive: boolean;
  sortOrder: number;
  containerExtension: string | null;
  urlExt: string | null;
  categoryName: string | null;
  vodRating?: string | null;
  vodPlot?: string | null;
  ord: bigint;
};

/** One SQL round-trip for Xtream catalogs — skip ID list + Prisma hydrate of source URLs. */
async function loadLeanListingForLine(
  line: LineWithBouquets,
  options?: StreamsForLineOptions
): Promise<StreamForLine[]> {
  const excludeDisabled = options?.excludeDisabled !== false;
  const bouquetIds = activeBouquetIds(line, excludeDisabled);
  if (!bouquetIds.length) return [];

  const types = typeList(options);
  const typeTexts = types?.map((t) => String(t)) ?? null;
  const rows = await prisma.$queryRaw<LeanListingRow[]>`
    SELECT
      s.id,
      s.name,
      s.type,
      s."streamIcon" AS "streamIcon",
      s."epgChannelId" AS "epgChannelId",
      s."channelId" AS "channelId",
      s."createdAt" AS "createdAt",
      s."updatedAt" AS "updatedAt",
      s."categoryId" AS "categoryId",
      s."vodMode" AS "vodMode",
      s."archiveDays" AS "archiveDays",
      s."timeshiftSeconds" AS "timeshiftSeconds",
      s."isShifted" AS "isShifted",
      s."isAdult" AS "isAdult",
      s."isActive" AS "isActive",
      s."sortOrder" AS "sortOrder",
      s."containerExtension" AS "containerExtension",
      substring(split_part(s."streamUrl", '?', 1) from '[.]([A-Za-z0-9]{2,4})$') AS "urlExt",
      c.name AS "categoryName",
      ${vodMetaSelectSql(options)},
      s."sortOrder"::bigint AS ord
    FROM ${bouquetMembershipSql(bouquetIds)} m
    INNER JOIN "Stream" s ON s.id = m."streamId"
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    WHERE 1=1
      ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
      ${listingPlayableSql()}
      ${
        typeTexts && typeTexts.length
          ? Prisma.sql`AND s.type::text IN (${Prisma.join(typeTexts)})`
          : Prisma.empty
      }
      ${
        options?.uncategorizedOnly
          ? Prisma.sql`AND (s."categoryId" IS NULL OR s."categoryId" = '')`
          : options?.categoryIds && options.categoryIds.length
            ? Prisma.sql`AND s."categoryId" IN (${Prisma.join(options.categoryIds)})`
            : Prisma.empty
      }
    ${listingOrderSql(options)}
  `;
  return rows.map(({ ord: _ord, ...s }) => s as unknown as StreamForLine);
}

function listingFilterSql(line: LineWithBouquets, options?: StreamsForLineOptions) {
  const excludeDisabled = options?.excludeDisabled !== false;
  const bouquetIds = activeBouquetIds(line, excludeDisabled);
  const types = typeList(options);
  const typeTexts = types?.map((t) => String(t)) ?? null;
  return {
    bouquetIds,
    excludeDisabled,
    where: Prisma.sql`
      ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
      ${listingPlayableSql()}
      ${
        typeTexts && typeTexts.length
          ? Prisma.sql`AND s.type::text IN (${Prisma.join(typeTexts)})`
          : Prisma.empty
      }
      ${
        options?.uncategorizedOnly
          ? Prisma.sql`AND (s."categoryId" IS NULL OR s."categoryId" = '')`
          : options?.categoryIds && options.categoryIds.length
            ? Prisma.sql`AND s."categoryId" IN (${Prisma.join(options.categoryIds)})`
            : Prisma.empty
      }
    `,
  };
}

/**
 * Keyset-batched lean listing. Used by M3U / Xtream catalog blobs so a 475k
 * bouquet never materialises as one Node array.
 */
export async function forEachLeanListingBatch(
  line: LineWithBouquets,
  options: StreamsForLineOptions | undefined,
  onBatch: (streams: StreamForLine[]) => void | Promise<void>
): Promise<void> {
  const filter = listingFilterSql(line, options);
  if (!filter.bouquetIds.length) return;

  const newest = listingUsesNewestFirst(options);
  let cursor: ListingCursor | null = null;
  for (;;) {
    const cursorSql = listingCursorSql(cursor);
    const rows = (await prisma.$queryRaw`
      SELECT
        s.id,
        s.name,
        s.type,
        s."streamIcon" AS "streamIcon",
        s."epgChannelId" AS "epgChannelId",
        s."channelId" AS "channelId",
        s."createdAt" AS "createdAt",
        s."updatedAt" AS "updatedAt",
        s."categoryId" AS "categoryId",
        s."vodMode" AS "vodMode",
        s."archiveDays" AS "archiveDays",
        s."timeshiftSeconds" AS "timeshiftSeconds",
        s."isShifted" AS "isShifted",
        s."isAdult" AS "isAdult",
        s."isActive" AS "isActive",
        s."sortOrder" AS "sortOrder",
        s."containerExtension" AS "containerExtension",
        substring(split_part(s."streamUrl", '?', 1) from '[.]([A-Za-z0-9]{2,4})$') AS "urlExt",
        c.name AS "categoryName",
        ${vodMetaSelectSql(options)},
        s."sortOrder"::bigint AS ord
      FROM ${bouquetMembershipSql(filter.bouquetIds)} m
      INNER JOIN "Stream" s ON s.id = m."streamId"
      LEFT JOIN "Category" c ON c.id = s."categoryId"
      WHERE 1=1
        ${filter.where}
        ${cursorSql}
      ${listingOrderSql(options)}
      LIMIT ${STREAM_BATCH}
    `) as LeanListingRow[];
    if (!rows.length) return;
    const mapped = rows.map(({ ord: _ord, ...s }) => s as unknown as StreamForLine);
    await onBatch(mapped);
    const last = rows[rows.length - 1]!;
    cursor = newest
      ? { kind: "newest", createdAt: last.createdAt, id: last.id }
      : { kind: "order", sortOrder: last.sortOrder, name: last.name, id: last.id };
    if (rows.length < STREAM_BATCH) return;
    await yieldEventLoop();
  }
}

/** Distinct stream IDs for a line (ordered), without hydrating Stream rows. */
export async function streamIdsForLine(
  line: LineWithBouquets,
  options?: StreamsForLineOptions
): Promise<string[]> {
  const excludeDisabled = options?.excludeDisabled !== false;
  const bouquetIds = activeBouquetIds(line, excludeDisabled);
  if (!bouquetIds.length) return [];

  const types = typeList(options);
  const typeTexts = types?.map((t) => String(t)) ?? null;
  // Exclude pending:// placeholders (empty XUI sources) from Xtream/M3U exports —
  // they 502 in apps and slow playlist load with dead channels.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id AS id
    FROM ${bouquetMembershipSql(bouquetIds)} m
    INNER JOIN "Stream" s ON s.id = m."streamId"
    WHERE 1=1
      ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
      ${listingPlayableSql()}
    ${
      typeTexts && typeTexts.length
        ? Prisma.sql`AND s.type::text IN (${Prisma.join(typeTexts)})`
        : Prisma.empty
    }
    ${
      options?.uncategorizedOnly
        ? Prisma.sql`AND (s."categoryId" IS NULL OR s."categoryId" = '')`
        : options?.categoryIds && options.categoryIds.length
          ? Prisma.sql`AND s."categoryId" IN (${Prisma.join(options.categoryIds)})`
          : Prisma.empty
    }
    ${listingOrderSql(options)}
  `;
  return rows.map((r) => r.id);
}

/** Count streams for Stalker pagination headers (no hydration). */
export async function streamCountForLine(
  line: LineWithBouquets,
  options?: Omit<StreamsForLineOptions, "offset" | "limit" | "onBatch" | "lean">
): Promise<number> {
  const excludeDisabled = options?.excludeDisabled !== false;
  const bouquetIds = activeBouquetIds(line, excludeDisabled);
  if (!bouquetIds.length) return 0;

  const types = typeList(options);
  const typeTexts = types?.map((t) => String(t)) ?? null;
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM ${bouquetMembershipSql(bouquetIds)} m
    INNER JOIN "Stream" s ON s.id = m."streamId"
    WHERE 1=1
      ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
      ${listingPlayableSql()}
    ${
      typeTexts && typeTexts.length
        ? Prisma.sql`AND s.type::text IN (${Prisma.join(typeTexts)})`
        : Prisma.empty
    }
    ${
      options?.uncategorizedOnly
        ? Prisma.sql`AND (s."categoryId" IS NULL OR s."categoryId" = '')`
        : options?.categoryIds && options.categoryIds.length
          ? Prisma.sql`AND s."categoryId" IN (${Prisma.join(options.categoryIds)})`
          : Prisma.empty
    }
  `;
  return Number(rows[0]?.count ?? 0);
}

/** Distinct category IDs used by a line for a stream type (no Stream hydration). */
export async function categoryIdsForLine(
  line: LineWithBouquets,
  options?: { excludeDisabled?: boolean; type?: StreamType | StreamType[] }
): Promise<{ categoryIds: string[]; hasUncategorized: boolean }> {
  const excludeDisabled = options?.excludeDisabled !== false;
  const bouquetIds = activeBouquetIds(line, excludeDisabled);
  if (!bouquetIds.length) return { categoryIds: [], hasUncategorized: false };

  const types = typeList(options);
  const typeTexts = types?.map((t) => String(t)) ?? null;
  const typeKey = typeTexts?.slice().sort().join(",") || "all";
  const token = lineBouquetCacheToken(line, excludeDisabled);
  return cacheGetOrSet(`xtream:linecats:${typeKey}:${token}`, 180, async () => {
    const rows = await prisma.$queryRaw<{ categoryId: string | null }[]>`
      SELECT DISTINCT s."categoryId" AS "categoryId"
      FROM "BouquetStream" bs
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
        ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
        ${listingPlayableSql()}
      ${
        typeTexts && typeTexts.length
          ? Prisma.sql`AND s.type::text IN (${Prisma.join(typeTexts)})`
          : Prisma.empty
      }
    `;
    const categoryIds: string[] = [];
    let hasUncategorized = false;
    for (const r of rows) {
      if (r.categoryId == null || r.categoryId === "") hasUncategorized = true;
      else categoryIds.push(r.categoryId);
    }
    return { categoryIds, hasUncategorized };
  });
}

/**
 * Load streams for a line via bouquet membership (SQL), without hydrating
 * 100k+ nested rows on the Line include. Optional type/category filters keep
 * Xtream and M3U endpoints from pulling the entire catalog at once.
 */
export async function streamsForLine(
  line: LineWithBouquets,
  options?: StreamsForLineOptions
): Promise<StreamForLine[]> {
  const { offset, limit, ...idQueryOpts } = options ?? {};

  if (options?.lean === true && limit == null && offset == null) {
    if (options.onBatch) {
      await forEachLeanListingBatch(line, idQueryOpts, options.onBatch);
      return [];
    }
    return loadLeanListingForLine(line, idQueryOpts);
  }

  let ids = await streamIdsForLine(line, idQueryOpts);
  if (limit != null && limit > 0) {
    const off = Math.max(0, offset ?? 0);
    ids = ids.slice(off, off + limit);
  } else if (offset != null && offset > 0) {
    ids = ids.slice(offset);
  }
  if (!ids.length) return [];

  const out: StreamForLine[] = [];

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += STREAM_BATCH) {
    batches.push(ids.slice(i, i + STREAM_BATCH));
  }

  if (options?.onBatch) {
    for (const chunkIds of batches) {
      await options.onBatch(await loadStreamChunk(chunkIds, options));
    }
    return [];
  }

  // Export/playlist paths: fetch batches concurrently (bounded) while keeping
  // deterministic sort order; sequential 1500-row round trips dominate latency.
  const PARALLEL = 4;
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const group = batches.slice(i, i + PARALLEL);
    const loaded = await Promise.all(group.map((chunkIds) => loadStreamChunk(chunkIds, options)));
    for (const ordered of loaded) out.push(...ordered);
  }

  return out;
}

/** Sync helper for admin paths that already nested bouquet.streams in memory. */
export function streamsFromNestedLineBouquets(
  line: LineWithNestedBouquetStreams,
  options?: { excludeDisabled?: boolean }
): Stream[] {
  const excludeDisabled = options?.excludeDisabled !== false;
  const byId = new Map<string, { stream: Stream; order: number }>();

  for (const lb of line.bouquets) {
    if (excludeDisabled && !lb.bouquet.isActive) continue;
    for (const bs of lb.bouquet.streams) {
      if (excludeDisabled && !bs.stream.isActive) continue;
      const order = bs.sortOrder * 1_000_000 + bs.stream.sortOrder;
      const prev = byId.get(bs.stream.id);
      if (!prev || order < prev.order) {
        byId.set(bs.stream.id, { stream: bs.stream, order });
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => a.order - b.order || a.stream.name.localeCompare(b.stream.name))
    .map((x) => x.stream);
}

export async function streamsForLineExport(
  line: LineWithBouquets,
  options?: StreamsForLineOptions
): Promise<StreamForLine[]> {
  const { excludeDisabledFromExport } = await import("@/lib/export-policy");
  const exclude = await excludeDisabledFromExport();
  return streamsForLine(line, {
    ...options,
    excludeDisabled: options?.excludeDisabled ?? exclude,
  });
}

export async function logActivity(
  action: string,
  opts: {
    userId?: string;
    lineId?: string;
    entity?: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  }
) {
  await prisma.activityLog.create({
    data: {
      action,
      userId: opts.userId,
      lineId: opts.lineId,
      entity: opts.entity,
      entityId: opts.entityId,
      meta: opts.meta ? (opts.meta as Prisma.InputJsonValue) : undefined,
    },
  });
}
