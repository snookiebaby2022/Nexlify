import { prisma } from "@/lib/prisma";
import { StreamType, CategoryType } from "@prisma/client";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-page-sizes";
import { streamListOrderBy } from "@/lib/stream-order";
import { attachStreamEpgWorking } from "@/lib/epg-working-status";
import { categoryTypeForStream } from "@/lib/category-options";
import { cacheGetOrSet } from "@/lib/cache";
import { listAdminServersLite } from "@/lib/admin-servers-list";

export async function bootstrapAdminStreamsPage(opts: {
  type?: "LIVE" | "MOVIE" | "SERIES";
  page?: number;
  pageSize?: number;
}) {
  const type = (opts.type ?? "LIVE") as StreamType;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, opts.pageSize ?? DEFAULT_LIST_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const [streams, total, categories, servers, typeTotals] = await Promise.all([
    prisma.stream.findMany({
      where: { type },
      skip,
      take: pageSize,
      orderBy: streamListOrderBy(type === StreamType.LIVE ? "order" : null, type),
      select: {
        id: true,
        name: true,
        streamUrl: true,
        type: true,
        isActive: true,
        vodMode: true,
        isOnDemand: true,
        isRadio: true,
        isCreatedChannel: true,
        serverId: true,
        categoryId: true,
        epgChannelId: true,
        channelId: true,
        timeshiftSeconds: true,
        isShifted: true,
        hostedExternally: true,
        agentStartCmd: true,
        lastProbeOk: true,
        streamIcon: true,
        sortOrder: true,
        server: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    cacheGetOrSet(`admin:stream-count:${JSON.stringify({ type })}`, 45, () =>
      prisma.stream.count({ where: { type } })
    ),
    prisma.category.findMany({
      where: { categoryType: categoryTypeForStream(type) as CategoryType },
      select: { id: true, name: true, parentId: true, sortOrder: true, categoryType: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    listAdminServersLite(),
    cacheGetOrSet("admin:stream-type-totals:v1", 120, async () => {
      const totalRows = await prisma.stream.groupBy({ by: ["type"], _count: true });
      const next: Record<string, number> = { LIVE: 0, MOVIE: 0, SERIES: 0 };
      for (const row of totalRows) next[row.type] = row._count;
      return next;
    }),
  ]);

  const listed = await attachStreamEpgWorking(streams);

  return {
    streams: listed,
    total,
    page,
    pageSize,
    categories,
    servers,
    typeTotals,
  };
}
