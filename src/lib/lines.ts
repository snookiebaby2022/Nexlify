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

/**
 * Load streams for a line via bouquet membership (SQL), without hydrating
 * 100k+ nested rows on the Line include. Optional type filter keeps Xtream
 * live/VOD/series endpoints from pulling the entire catalog.
 */
export async function streamsForLine(
  line: LineWithBouquets,
  options?: {
    excludeDisabled?: boolean;
    type?: StreamType | StreamType[];
  }
): Promise<StreamForLine[]> {
  const excludeDisabled = options?.excludeDisabled !== false;
  const bouquetIds = activeBouquetIds(line, excludeDisabled);
  if (!bouquetIds.length) return [];

  const types = options?.type
    ? Array.isArray(options.type)
      ? options.type
      : [options.type]
    : null;

  const rows = await prisma.bouquetStream.findMany({
    where: {
      bouquetId: { in: bouquetIds },
      stream: {
        ...(excludeDisabled ? { isActive: true } : {}),
        ...(types && types.length ? { type: { in: types } } : {}),
      },
    },
    select: {
      sortOrder: true,
      stream: {
        include: {
          provider: { select: { baseUrl: true } },
          server: { select: { host: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }],
  });

  const byId = new Map<string, { stream: StreamForLine; order: number }>();
  for (const bs of rows) {
    const s = bs.stream;
    if (excludeDisabled && !s.isActive) continue;
    const order = bs.sortOrder * 1_000_000 + s.sortOrder;
    const prev = byId.get(s.id);
    if (!prev || order < prev.order) {
      byId.set(s.id, { stream: s, order });
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => a.order - b.order || a.stream.name.localeCompare(b.stream.name))
    .map((x) => x.stream);
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
  options?: { type?: StreamType | StreamType[] }
): Promise<StreamForLine[]> {
  const { excludeDisabledFromExport } = await import("@/lib/export-policy");
  const exclude = await excludeDisabledFromExport();
  return streamsForLine(line, { excludeDisabled: exclude, type: options?.type });
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
