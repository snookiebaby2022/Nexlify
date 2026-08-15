import { LineStatus, Prisma, type Line, type Stream, type Bouquet } from "@prisma/client";

export type { Line };
import { prisma } from "./prisma";

const lineInclude = {
  bouquets: {
    include: {
      bouquet: {
        include: {
          streams: {
            include: {
              stream: {
                include: { provider: true, server: true },
              },
            },
            orderBy: { sortOrder: "asc" as const },
          },
        },
      },
    },
  },
} as const;

export type LineWithBouquets = Prisma.LineGetPayload<{
  include: typeof lineInclude;
}>;

export async function getLineByCredentials(
  username: string,
  password: string
): Promise<LineWithBouquets | null> {
  const line = await prisma.line.findUnique({
    where: { username },
    include: lineInclude,
  });
  if (line && line.password === password) return line;

  const code = username.trim().toUpperCase();
  if (!code) return null;

  const activeLine = await prisma.line.findFirst({
    where: { activeCode: code, authMode: "ACTIVE_CODE" },
    include: lineInclude,
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

export function streamsForLine(
  line: LineWithBouquets,
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

export async function streamsForLineExport(line: LineWithBouquets): Promise<Stream[]> {
  const { excludeDisabledFromExport } = await import("@/lib/export-policy");
  const exclude = await excludeDisabledFromExport();
  return streamsForLine(line, { excludeDisabled: exclude });
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
