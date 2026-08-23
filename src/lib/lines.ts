import { LineStatus, Prisma, StreamType, type Line, type Stream } from "@prisma/client";
import { createHash } from "crypto";

export type { Line };
import { prisma } from "./prisma";
import { cacheGetOrSet } from "./cache";

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

export type StreamForLine = Stream & {
  provider?: { baseUrl?: string | null } | null;
  server?: { host?: string | null } | null;
};

export type StreamsForLineOptions = {
  excludeDisabled?: boolean;
  type?: StreamType | StreamType[];
  /** When set, only streams in these category IDs (use null sentinel via uncategorizedOnly). */
  categoryIds?: string[] | null;
  /** When true, only streams with no category (NULL or empty). */
  uncategorizedOnly?: boolean;
  /** Skip provider/server joins (enough for M3U live paths and listings). */
  lean?: boolean;
  /** Process streams in ordered batches without holding the full catalog in RAM. */
  onBatch?: (streams: StreamForLine[]) => void | Promise<void>;
  /** Pagination for Stalker get_ordered_list (Ministra page size). */
  offset?: number;
  limit?: number;
};

const STREAM_BATCH = 1500;

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
        select: leanStreamSelect(options),
      })
    : await prisma.stream.findMany({
        where: { id: { in: chunkIds } },
        include: {
          provider: { select: { baseUrl: true } },
          server: { select: { host: true } },
        },
      });
  const byId = new Map(rows.map((s) => [s.id, s as StreamForLine]));
  return chunkIds.map((id) => byId.get(id)).filter((s): s is StreamForLine => Boolean(s));
}

/** Streams with a resolvable playback URL (matches Xtream/M3U export rules). */
function playableStreamUrlSql() {
  return Prisma.sql`
    AND (
      s."backupUrl" LIKE 'http://%'
      OR s."backupUrl" LIKE 'https://%'
      OR (
        s."streamUrl" NOT LIKE 'pending://%'
        AND (
          s."streamUrl" LIKE 'http://%'
          OR s."streamUrl" LIKE 'https://%'
          OR s."streamUrl" LIKE 'nexlify://%'
          OR (
            s."playlistUrl" IS NOT NULL
            AND (
              s."playlistUrl" LIKE 'http://%'
              OR s."playlistUrl" LIKE 'https://%'
            )
          )
        )
      )
    )
  `;
}

function typeList(options?: StreamsForLineOptions): StreamType[] | null {
  if (!options?.type) return null;
  return Array.isArray(options.type) ? options.type : [options.type];
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
    SELECT * FROM (
      SELECT DISTINCT ON (s.id)
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
        (bs."sortOrder"::bigint * 1000000 + s."sortOrder"::bigint) AS ord
      FROM "BouquetStream" bs
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
      ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
      ${playableStreamUrlSql()}
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
      ORDER BY s.id, (bs."sortOrder"::bigint * 1000000 + s."sortOrder"::bigint) ASC
    ) x
    ORDER BY x.ord ASC, x.id ASC
  `;
  return rows.map(({ ord: _ord, ...s }) => s as StreamForLine);
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
    SELECT s.id AS id, MIN(bs."sortOrder"::bigint * 1000000 + s."sortOrder"::bigint) AS ord
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
    ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
    ${playableStreamUrlSql()}
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
    GROUP BY s.id
    ORDER BY ord ASC, s.id ASC
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
    SELECT COUNT(DISTINCT s.id)::bigint AS count
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
    ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
    ${playableStreamUrlSql()}
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
  const rows = await prisma.$queryRaw<{ categoryId: string | null }[]>`
    SELECT DISTINCT s."categoryId" AS "categoryId"
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
    ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
    ${playableStreamUrlSql()}
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

  if (options?.lean === true && !options?.onBatch && limit == null && offset == null) {
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
