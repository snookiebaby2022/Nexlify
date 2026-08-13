import { prisma } from "@/lib/prisma";
import type { CategoryType } from "@prisma/client";

/** Collect this category id plus all descendant subcategory ids (BFS, max depth 8). */
export async function expandCategoryFilter(categoryId: string): Promise<string[]> {
  const ids = [categoryId];
  let frontier = [categoryId];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const child of children) {
      if (!ids.includes(child.id)) {
        ids.push(child.id);
        frontier.push(child.id);
      }
    }
  }
  return ids;
}

/** Include ancestors so clients can render parent → subcategory trees. */
export async function collectCategoryAncestors(categoryIds: string[]): Promise<string[]> {
  const allIds = new Set(categoryIds);
  let frontier = [...categoryIds];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const parents = await prisma.category.findMany({
      where: { id: { in: frontier }, parentId: { not: null } },
      select: { parentId: true },
    });
    frontier = [];
    for (const p of parents) {
      if (p.parentId && !allIds.has(p.parentId)) {
        allIds.add(p.parentId);
        frontier.push(p.parentId);
      }
    }
  }
  return [...allIds];
}

export async function wouldCreateCategoryCycle(
  id: string,
  parentId: string | null
): Promise<boolean> {
  if (!parentId) return false;
  if (parentId === id) return true;
  let current: string | null = parentId;
  const seen = new Set<string>([id]);
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    const row: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = row?.parentId ?? null;
  }
  return false;
}

export async function resolveCategoryParent(opts: {
  parentId: unknown;
  childType: CategoryType;
}): Promise<{ parentId: string | null; error?: string }> {
  if (opts.parentId == null || opts.parentId === "" || opts.parentId === false) {
    return { parentId: null };
  }
  const parentId = String(opts.parentId).trim();
  if (!parentId) return { parentId: null };
  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { id: true, categoryType: true },
  });
  if (!parent) return { parentId: null, error: "Parent category not found" };
  if (parent.categoryType !== opts.childType) {
    return {
      parentId: null,
      error: `Parent must be the same type (${opts.childType})`,
    };
  }
  return { parentId: parent.id };
}

/** Null parent links then delete categories safely (self-FK). */
export async function deleteCategoriesSafe(ids: string[]) {
  if (!ids.length) return;
  await prisma.stream.updateMany({
    where: { categoryId: { in: ids } },
    data: { categoryId: null },
  });
  await prisma.category.updateMany({
    where: { id: { in: ids } },
    data: { parentId: null },
  });
  await prisma.category.deleteMany({ where: { id: { in: ids } } });
}

/** Clear all categories without self-FK errors. */
export async function clearAllCategoriesSafe() {
  await prisma.category.updateMany({ data: { parentId: null } });
  await prisma.category.deleteMany();
}

export { categoryLabel, labeledCategoryOptions, collectDescendantIdsLocal, categoryTypeForStream } from "./category-options";

/** BFS descendants of a category (excludes the root id). */
export async function collectDescendantCategoryIds(parentId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [parentId];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const child of children) {
      if (!ids.includes(child.id)) {
        ids.push(child.id);
        frontier.push(child.id);
      }
    }
  }
  return ids;
}
