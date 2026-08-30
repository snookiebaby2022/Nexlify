import type { PrismaClient } from "@prisma/client";
import { StreamType } from "@prisma/client";
import { literalLiveNameKey, pickKeepId, type DuplicateScanRow } from "./stream-duplicates";

export type RemoveDuplicateStreamsResult = {
  scanned: number;
  duplicateGroups: number;
  merged: number;
  ghostOnDemand: number;
  samples: { kept: string; removed: string[] }[];
};

function nameKey(name: string, streamType: StreamType, categoryId?: string | null): string {
  const base =
    streamType === StreamType.LIVE
      ? literalLiveNameKey(name)
      : name.toLowerCase().replace(/\s+/g, " ").trim();
  if (!base) return "";
  if (streamType === StreamType.LIVE) return `${base}::${categoryId ?? ""}`;
  return base;
}

export async function removeDuplicateStreamsByName(
  prisma: PrismaClient,
  opts: {
    streamType: StreamType;
    isRadio?: boolean;
    dryRun?: boolean;
    sampleLimit?: number;
  }
): Promise<RemoveDuplicateStreamsResult> {
  const result: RemoveDuplicateStreamsResult = {
    scanned: 0,
    duplicateGroups: 0,
    merged: 0,
    ghostOnDemand: 0,
    samples: [],
  };

  if (opts.streamType === StreamType.LIVE && opts.isRadio !== true) {
    const ghosts = await prisma.stream.findMany({
      where: {
        type: StreamType.LIVE,
        isRadio: false,
        AND: [
          { OR: [{ isOnDemand: true }, { vodMode: "ON_DEMAND" }] },
          { OR: [{ streamIcon: null }, { streamIcon: "" }] },
        ],
      },
      select: { id: true },
    });
    result.ghostOnDemand = ghosts.length;
    if (!opts.dryRun && ghosts.length) {
      await prisma.stream.deleteMany({ where: { id: { in: ghosts.map((g) => g.id) } } });
    }
  }

  const rows = await prisma.stream.findMany({
    where: {
      type: opts.streamType,
      ...(opts.streamType === StreamType.LIVE
        ? { isRadio: opts.isRadio === true }
        : {}),
    },
    select: {
      id: true,
      name: true,
      streamUrl: true,
      type: true,
      seriesName: true,
      seasonNum: true,
      episodeNum: true,
      isActive: true,
      categoryId: true,
      createdAt: true,
      isOnDemand: true,
      vodMode: true,
      streamIcon: true,
      category: { select: { name: true } },
      _count: { select: { bouquets: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const groups = new Map<string, DuplicateScanRow[]>();
  for (const r of rows) {
    result.scanned++;
    const key = nameKey(r.name, opts.streamType, r.categoryId);
    if (!key) continue;
    const mapped: DuplicateScanRow = {
      id: r.id,
      name: r.name,
      streamUrl: r.streamUrl,
      type: r.type,
      seriesName: r.seriesName,
      seasonNum: r.seasonNum,
      episodeNum: r.episodeNum,
      isActive: r.isActive,
      categoryId: r.categoryId,
      categoryName: r.category?.name ?? null,
      bouquetCount: r._count.bouquets,
      createdAt: r.createdAt,
      isOnDemand: Boolean(r.isOnDemand || r.vodMode === "ON_DEMAND"),
      hasIcon: Boolean(String(r.streamIcon ?? "").trim()),
    };
    const list = groups.get(key) ?? [];
    list.push(mapped);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    result.duplicateGroups++;
    const keepId = pickKeepId(group);
    const keep = group.find((g) => g.id === keepId)!;
    const removed = group.filter((g) => g.id !== keepId);

    if (result.samples.length < (opts.sampleLimit ?? 20)) {
      result.samples.push({
        kept: keep.name,
        removed: removed.map((r) => r.name),
      });
    }

    if (!opts.dryRun) {
      for (const drop of removed) {
        await prisma.stream.delete({ where: { id: drop.id } });
        result.merged++;
      }
    } else {
      result.merged += removed.length;
    }
  }

  return result;
}
