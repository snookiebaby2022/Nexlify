import type { PrismaClient } from "@prisma/client";
import { StreamType } from "@prisma/client";
import { pickKeepId, type DuplicateScanRow } from "./stream-duplicates";

export type RemoveDuplicateStreamsResult = {
  scanned: number;
  duplicateGroups: number;
  merged: number;
  samples: { kept: string; removed: string[] }[];
};

function nameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
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
    samples: [],
  };

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
      category: { select: { name: true } },
      _count: { select: { bouquets: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const groups = new Map<string, DuplicateScanRow[]>();
  for (const r of rows) {
    result.scanned++;
    const key = nameKey(r.name);
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
