import type { CategoryType, PrismaClient } from "@prisma/client";
import { normalizeCategoryName } from "./category-options";

export type RemoveDuplicateCategoriesResult = {
  scanned: number;
  duplicateGroups: number;
  merged: number;
  samples: { kept: string; removed: string[] }[];
};

function duplicateKey(categoryType: CategoryType, name: string): string {
  return `${categoryType}:${normalizeCategoryName(name)}`;
}

/**
 * Merge categories that share the same name (case/spacing insensitive) within a type.
 */
export async function removeDuplicateCategories(
  prisma: PrismaClient,
  opts?: { categoryType?: CategoryType; dryRun?: boolean; sampleLimit?: number }
): Promise<RemoveDuplicateCategoriesResult> {
  const result: RemoveDuplicateCategoriesResult = {
    scanned: 0,
    duplicateGroups: 0,
    merged: 0,
    samples: [],
  };

  const cats = await prisma.category.findMany({
    where: opts?.categoryType ? { categoryType: opts.categoryType } : undefined,
    select: {
      id: true,
      name: true,
      categoryType: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { streams: true } },
    },
    orderBy: [{ categoryType: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const groups = new Map<string, typeof cats>();
  for (const c of cats) {
    result.scanned++;
    const key = duplicateKey(c.categoryType, c.name);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    result.duplicateGroups++;

    const sorted = [...group].sort((a, b) => {
      const aPipe = a.name.includes("|") ? 1 : 0;
      const bPipe = b.name.includes("|") ? 1 : 0;
      if (bPipe !== aPipe) return bPipe - aPipe;
      if (b._count.streams !== a._count.streams) return b._count.streams - a._count.streams;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const keep = sorted[0]!;
    const removed = sorted.slice(1);

    if (result.samples.length < (opts?.sampleLimit ?? 20)) {
      result.samples.push({
        kept: keep.name,
        removed: removed.map((r) => r.name),
      });
    }

    if (!opts?.dryRun) {
      for (const drop of removed) {
        await prisma.stream.updateMany({
          where: { categoryId: drop.id },
          data: { categoryId: keep.id },
        });
        await prisma.category.delete({ where: { id: drop.id } });
        result.merged++;
      }
    } else {
      result.merged += removed.length;
    }
  }

  return result;
}
