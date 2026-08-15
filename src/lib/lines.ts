import { LineStatus, Prisma, StreamType, type Line, type Stream } from "@prisma/client";

export type { Line };
import { prisma } from "./prisma";

/** Auth / listing include — bouquets only, never nested BouquetStream rows (can be 100k+). */
const lineAuthInclude = {
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

export async function getLineByCredentials(
  username: string,
  password: string
): Promise<LineWithBouquets | null> {
  const line = await prisma.line.findUnique({
    where: { username },
    include: lineAuthInclude,
  });
  if (line && line.password === password) return line;

  const code = username.trim().toUpperCase();
  if (!code) return null;

  const activeLine = await prisma.line.findFirst({
    where: { activeCode: code, authMode: "ACTIVE_CODE" },
    include: lineAuthInclude,
  });
  if (!activeLine) return null;
  if (password && password !== activeLine.password && password !== code) return null;
  return activeLine;
}

export function effectiveLineStatus(line: Pick<Line, "status" | "expiresAt">): LineStatus {
  if (line.status === LineStatus.BANNED || line.status === LineStatus.DISABLED) {
    return line.status;
  }
  if (line.expiresAt && line.expiresAt < new Date()) return LineStatus.EXPIRED;
  return line.status;
}

export function lineIsPlayable(line: Pick<Line, "status" | "expiresAt">) {
  return effectiveLineStatus(line) === LineStatus.ACTIVE;
}

function activeBouquetIds(line: LineWithBouquets, excludeDisabled: boolean): string[] {
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
  /** When true, only streams with categoryId IS NULL. */
  uncategorizedOnly?: boolean;
  /** Skip provider/server joins (enough for M3U live paths and listings). */
  lean?: boolean;
  /** Process streams in ordered batches without holding the full catalog in RAM. */
  onBatch?: (streams: StreamForLine[]) => void | Promise<void>;
};

const STREAM_BATCH = 1500;

function typeList(options?: StreamsForLineOptions): StreamType[] | null {
  if (!options?.type) return null;
  return Array.isArray(options.type) ? options.type : [options.type];
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
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id AS id, MIN(bs."sortOrder" * 1000000 + s."sortOrder") AS ord
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
    ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
    ${types && types.length ? Prisma.sql`AND s.type IN (${Prisma.join(types)})` : Prisma.empty}
    ${
      options?.uncategorizedOnly
        ? Prisma.sql`AND s."categoryId" IS NULL`
        : options?.categoryIds && options.categoryIds.length
          ? Prisma.sql`AND s."categoryId" IN (${Prisma.join(options.categoryIds)})`
          : Prisma.empty
    }
    GROUP BY s.id
    ORDER BY ord ASC, s.id ASC
  `;
  return rows.map((r) => r.id);
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
  const rows = await prisma.$queryRaw<{ categoryId: string | null }[]>`
    SELECT DISTINCT s."categoryId" AS "categoryId"
    FROM "BouquetStream" bs
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE bs."bouquetId" IN (${Prisma.join(bouquetIds)})
    ${excludeDisabled ? Prisma.sql`AND s."isActive" = true` : Prisma.empty}
    ${types && types.length ? Prisma.sql`AND s.type IN (${Prisma.join(types)})` : Prisma.empty}
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
  const ids = await streamIdsForLine(line, options);
  if (!ids.length) return [];

  const lean = options?.lean === true;
  const out: StreamForLine[] = [];

  for (let i = 0; i < ids.length; i += STREAM_BATCH) {
    const chunkIds = ids.slice(i, i + STREAM_BATCH);
    const rows = await prisma.stream.findMany({
      where: { id: { in: chunkIds } },
      ...(lean
        ? {}
        : {
            include: {
              provider: { select: { baseUrl: true } },
              server: { select: { host: true } },
            },
          }),
    });
    const byId = new Map(rows.map((s) => [s.id, s as StreamForLine]));
    const ordered = chunkIds
      .map((id) => byId.get(id))
      .filter((s): s is StreamForLine => Boolean(s));
    if (options?.onBatch) {
      await options.onBatch(ordered);
    } else {
      out.push(...ordered);
    }
  }

  return options?.onBatch ? [] : out;
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
