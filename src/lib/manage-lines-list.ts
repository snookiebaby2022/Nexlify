import { PanelRole, Prisma, LineStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LIVE_STALE_MS } from "@/lib/connections";
import type { SessionUser } from "@/lib/auth";
import type { ManageLineRow } from "@/components/manage-lines-table";
import { applyOwnerFilter, lineOwnerIdsForSession } from "@/lib/line-owner-filter";
import { listedLinePassword } from "@/lib/listed-line-password";

export { listedLinePassword };

export type ManageLinesPageResult = {
  lines: ManageLineRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function lineWhereForSession(
  session: SessionUser,
  search: string,
  ownerFilter?: string,
  statusFilter?: string,
  trialFilter?: string,
  scopedOwnerIds?: string[] | null,
  bouquetId?: string
): Prisma.LineWhereInput {
  const where: Prisma.LineWhereInput = {};
  if (scopedOwnerIds) {
    where.ownerId = { in: scopedOwnerIds };
  }

  applyOwnerFilter(where, ownerFilter, session);

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400000);
  const farFuture = new Date(now.getTime() + 1000 * 86400000);

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "EXPIRED") {
      where.expiresAt = { lt: now };
      where.status = { not: LineStatus.BANNED };
    } else if (statusFilter === "EXPIRED_TRIAL") {
      where.isTrial = true;
      where.expiresAt = { lt: now };
    } else if (statusFilter === "EXPIRING_7") {
      where.expiresAt = { gte: now, lte: in7d };
      where.status = LineStatus.ACTIVE;
    } else if (statusFilter === "TRIAL_ACTIVE") {
      where.isTrial = true;
      where.expiresAt = { gte: now };
      where.status = LineStatus.ACTIVE;
    } else if (statusFilter === "NEVER_EXPIRE") {
      where.expiresAt = { gte: farFuture };
    } else if (statusFilter === "ONLINE") {
      where.liveConnections = {
        some: { lastSeenAt: { gte: new Date(Date.now() - LIVE_STALE_MS) } },
      };
    } else {
      const status =
        statusFilter === "DISABLED"
          ? LineStatus.DISABLED
          : statusFilter === "BANNED"
            ? LineStatus.BANNED
            : LineStatus.ACTIVE;
      where.status = status;
    }
  }

  if (trialFilter === "yes") where.isTrial = true;
  else if (trialFilter === "no") where.isTrial = false;

  const bouquet = bouquetId?.trim();
  if (bouquet) {
    where.bouquets = { some: { bouquetId: bouquet } };
  }

  if (search.trim()) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { username: { contains: search, mode: "insensitive" } },
          { password: { contains: search, mode: "insensitive" } },
          { id: { contains: search, mode: "insensitive" } },
          { externalId: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
          { owner: { username: { contains: search, mode: "insensitive" } } },
        ],
      },
    ];
  }

  return where;
}

export async function listManageLinesPage(opts: {
  session: SessionUser;
  page?: number;
  pageSize?: number;
  search?: string;
  ownerFilter?: string;
  statusFilter?: string;
  trialFilter?: string;
  bouquetId?: string;
  sort?: string;
  sortDir?: "asc" | "desc";
}): Promise<ManageLinesPageResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const skip = (page - 1) * pageSize;
  const search = opts.search?.trim() ?? "";
  const sortRaw = (opts.sort ?? "createdAt").trim();
  const sortDir = opts.sortDir === "asc" ? "asc" : "desc";
  const dir = sortDir as "asc" | "desc";
  const orderBy =
    sortRaw === "username"
      ? { username: dir }
      : sortRaw === "expiresAt"
        ? { expiresAt: dir }
        : sortRaw === "owner"
          ? { owner: { username: dir } }
          : sortRaw === "ownerRole"
            ? { owner: { role: dir } }
            : sortRaw === "status"
              ? { status: dir }
              : sortRaw === "maxConnections"
                ? { maxConnections: dir }
                : { createdAt: dir };

  const scopedOwnerIds = await lineOwnerIdsForSession(opts.session);
  const where = lineWhereForSession(
    opts.session,
    search,
    opts.ownerFilter,
    opts.statusFilter,
    opts.trialFilter,
    scopedOwnerIds,
    opts.bouquetId
  );
  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);

  const [lines, total] = await Promise.all([
    prisma.line.findMany({
      where,
      include: {
        bouquets: { include: { bouquet: { select: { id: true, name: true, isActive: true } } } },
        owner: { select: { id: true, username: true, role: true } },
        lastWatchedStream: { select: { id: true, name: true } },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.line.count({ where }),
  ]);

  const lineIds = lines.map((l) => l.id);
  const [activeConnections, activeCounts] = lineIds.length
    ? await Promise.all([
        prisma.liveConnection.findMany({
          where: {
            lastSeenAt: { gte: staleBefore },
            lineId: { in: lineIds },
          },
          distinct: ["lineId"],
          select: {
            lineId: true,
            ip: true,
            stream: { select: { name: true } },
            userAgent: true,
            lastSeenAt: true,
          },
          orderBy: { lastSeenAt: "desc" },
        }),
        prisma.liveConnection.groupBy({
          by: ["lineId"],
          where: {
            lastSeenAt: { gte: staleBefore },
            lineId: { in: lineIds },
          },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const activeConnByLineId = new Map<string, (typeof activeConnections)[number]>();
  const activeConnCountByLineId = new Map<string, number>();
  for (const conn of activeConnections) {
    activeConnByLineId.set(conn.lineId, conn);
  }
  for (const row of activeCounts) {
    activeConnCountByLineId.set(row.lineId, row._count._all);
  }

  return {
    lines: lines.map((line, index) => {
      const active = activeConnByLineId.get(line.id);
      const activeCount = activeConnCountByLineId.get(line.id) ?? 0;
      return {
        ...line,
        password: listedLinePassword(line.password),
        displayId: skip + index + 1,
        expiresAt: line.expiresAt.toISOString(),
        createdAt: line.createdAt.toISOString(),
        lastWatchedAt: line.lastWatchedAt?.toISOString() ?? null,
        activeConnectionCount: activeCount,
        activeConnection: active
          ? {
              ip: active.ip,
              streamName: active.stream?.name ?? null,
              userAgent: active.userAgent,
              lastSeenAt: active.lastSeenAt.toISOString(),
            }
          : null,
      } as ManageLineRow;
    }),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

export async function listManageLinesBouquets(
  session: SessionUser
): Promise<{ id: string; name: string }[]> {
  const where: Prisma.BouquetWhereInput = { isActive: true };
  if (session.role !== PanelRole.ADMIN) {
    where.OR = [{ ownerUserId: session.id }, { ownerUserId: null }];
  }
  return prisma.bouquet.findMany({
    where,
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 500,
  });
}
