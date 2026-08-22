import type { PrismaClient } from "@prisma/client";
import type { CategoryType } from "@prisma/client";
import { categoryMergeKey } from "./category-options";
import { formatXuiCategoryName } from "./category-xui-name";

export type NormalizeCategoryNamesResult = {
  scanned: number;
  renamed: number;
  merged: number;
  unchanged: number;
  samples: { from: string; to: string }[];
};

/**
 * Rename categories to XUI `REGION | Name` format and merge collisions created by renaming.
 */
export async function normalizeCategoryNamesToXui(
  prisma: PrismaClient,
  opts?: { categoryType?: CategoryType; dryRun?: boolean; sampleLimit?: number }
): Promise<NormalizeCategoryNamesResult> {
  const result: NormalizeCategoryNamesResult = {
    scanned: 0,
    renamed: 0,
    merged: 0,
    unchanged: 0,
    samples: [],
  };

  const cats = await prisma.category.findMany({
    where: opts?.categoryType ? { categoryType: opts.categoryType } : undefined,
    select: {
      id: true,
      name: true,
      categoryType: true,
      isAdult: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { streams: true } },
    },
    orderBy: [{ categoryType: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const byTypeName = new Map<string, (typeof cats)[number]>();
  for (const c of cats) {
    byTypeName.set(`${c.categoryType}:${c.name}`, c);
  }

  for (const c of cats) {
    result.scanned++;
    const formatted = formatXuiCategoryName(c.name, { isAdult: c.isAdult });
    if (formatted === c.name) {
      result.unchanged++;
      continue;
    }

    const targetKey = `${c.categoryType}:${formatted}`;
    const existing = byTypeName.get(targetKey);
    if (existing && existing.id !== c.id) {
      if (!opts?.dryRun) {
        await prisma.stream.updateMany({
          where: { categoryId: c.id },
          data: { categoryId: existing.id },
        });
        await prisma.category.delete({ where: { id: c.id } });
      }
      result.merged++;
      if (result.samples.length < (opts?.sampleLimit ?? 20)) {
        result.samples.push({ from: c.name, to: `${formatted} (merged into existing)` });
      }
      continue;
    }

    if (!opts?.dryRun) {
      await prisma.category.update({ where: { id: c.id }, data: { name: formatted } });
      byTypeName.delete(`${c.categoryType}:${c.name}`);
      byTypeName.set(targetKey, { ...c, name: formatted });
    }
    result.renamed++;
    if (result.samples.length < (opts?.sampleLimit ?? 20)) {
      result.samples.push({ from: c.name, to: formatted });
    }
  }

  if (!opts?.dryRun) {
    const after = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        categoryType: true,
        sortOrder: true,
        createdAt: true,
        _count: { select: { streams: true } },
      },
    });
    const groups = new Map<string, typeof after>();
    for (const c of after) {
      const key = `${c.categoryType}:${categoryMergeKey(c.name)}`;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => {
        const aPipe = a.name.includes("|") ? 1 : 0;
        const bPipe = b.name.includes("|") ? 1 : 0;
        if (bPipe !== aPipe) return bPipe - aPipe;
        if (b._count.streams !== a._count.streams) return b._count.streams - a._count.streams;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const keep = sorted[0]!;
      for (const drop of sorted.slice(1)) {
        await prisma.stream.updateMany({
          where: { categoryId: drop.id },
          data: { categoryId: keep.id },
        });
        await prisma.category.delete({ where: { id: drop.id } });
        result.merged++;
      }
    }
  }

  return result;
}
