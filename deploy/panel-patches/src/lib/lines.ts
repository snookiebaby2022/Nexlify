import { LineStatus, Prisma, type Line, type Stream, type Bouquet } from "@prisma/client";

export type { Line };
import { prisma } from "./prisma";

export type LineWithBouquets = Line & {
  bouquets: { bouquet: Bouquet & { streams: { stream: Stream }[] } }[];
};

const lineInclude = {
  bouquets: {
    include: {
      bouquet: {
        include: {
          streams: { include: { stream: true } },
        },
      },
    },
  },
} as const;

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
  if (line.expiresAt < new Date()) return LineStatus.EXPIRED;
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
  const map = new Map<string, Stream>();
  for (const lb of line.bouquets) {
    if (excludeDisabled && !lb.bouquet.isActive) continue;
    for (const bs of lb.bouquet.streams) {
      if (excludeDisabled && !bs.stream.isActive) continue;
      map.set(bs.stream.id, bs.stream);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
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
