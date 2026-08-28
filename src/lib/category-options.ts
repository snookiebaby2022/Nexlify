/** Client-safe category helpers (no Prisma). */

/** "UK | Entertainment" and "UK Entertainment" are the same folder to IPTV apps. */
export function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Aggressive key for merging near-duplicate category folders after migration.
 *  Keep country/region prefixes so "UK Entertainment" and "USA Entertainment"
 *  stay separate folders in IPTV apps. */
export function categoryMergeKey(name: string): string {
  let n = normalizeCategoryName(name);
  n = n.replace(/\s+(channels?|tv|live)\s*$/i, "");
  n = n.replace(/documentr(?:y|ies)/g, "documentary");
  return n.replace(/\s+/g, " ").trim();
}

export type CategoryOptionInput = {
  id: string;
  name: string;
  parentId?: string | null;
  categoryType?: string | null;
  sortOrder?: number;
};

export function categoryTypeForStream(
  streamType: string | undefined | null,
  isRadio?: boolean
): "LIVE" | "MOVIE" | "SERIES" | "RADIO" {
  if (isRadio) return "RADIO";
  if (streamType === "MOVIE") return "MOVIE";
  if (streamType === "SERIES") return "SERIES";
  return "LIVE";
}

export function categoryLabel(
  cat: { name: string; parentId?: string | null },
  byId: Map<string, { name: string; parentId?: string | null }>
): string {
  if (!cat.parentId) return cat.name;
  const parent = byId.get(cat.parentId);
  if (!parent) return cat.name;
  return `${parent.name} / ${cat.name}`;
}

/** Descendant ids of `id` within `cats` (does not include `id`). */
export function collectDescendantIdsLocal(
  id: string,
  cats: { id: string; parentId?: string | null }[]
): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const c of cats) {
    if (!c.parentId) continue;
    const list = childrenOf.get(c.parentId) ?? [];
    list.push(c.id);
    childrenOf.set(c.parentId, list);
  }
  const out = new Set<string>();
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const child of childrenOf.get(cur) ?? []) stack.push(child);
  }
  return out;
}

export function labeledCategoryOptions(
  cats: CategoryOptionInput[],
  typeFilter?: string | null
): { id: string; label: string }[] {
  const filtered = typeFilter
    ? cats.filter((c) => (c.categoryType ?? "LIVE") === typeFilter)
    : cats;
  const byId = new Map(filtered.map((c) => [c.id, c]));
  return [...filtered]
    .sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    })
    .map((c) => ({ id: c.id, label: categoryLabel(c, byId) }));
}
