import { StreamType, type CategoryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cacheGetOrSet } from "@/lib/cache";
import { categoryMergeKey } from "@/lib/category-options";

function cuidToNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function numericCategoryId(cuid?: string | null): string {
  if (!cuid) return "0";
  return String(cuidToNum(cuid));
}

/**
 * IPTV Smarters / XCIPTV "All" is not a real folder. Apps send *, all, or -1
 * (or omit the param). Treat those as unfiltered — otherwise the catalog
 * resolves to "missing" and the app shows no live / movies / series.
 */
export function isXtreamAllCategoryParam(categoryId?: string | null): boolean {
  const raw = String(categoryId ?? "").trim();
  if (!raw) return true;
  const s = raw.toLowerCase();
  return s === "*" || s === "all" || s === "-1" || s === "all_streams" || s === "null" || s === "undefined";
}

export type CanonicalCategoryEntry = {
  categoryId: string;
  numericId: string;
  name: string;
  mergeKey: string;
};

export type CanonicalCategoryMaps = {
  /** Every category cuid → canonical numeric id (for stream export). */
  numericByCategoryId: Map<string, string>;
  /** One row per merge group (for category list API). */
  byMergeKey: Map<string, CanonicalCategoryEntry>;
  /** numeric id string → all cuids in that merge group. */
  cuidsByNumericId: Map<string, string[]>;
};

function streamTypeToCategoryType(type: StreamType | CategoryType): CategoryType {
  const t = String(type);
  if (t === "MOVIE") return "MOVIE";
  if (t === "SERIES") return "SERIES";
  if (t === "RADIO") return "RADIO";
  return "LIVE";
}

export async function buildCanonicalCategoryMaps(
  type: StreamType | CategoryType
): Promise<CanonicalCategoryMaps> {
  const categoryType = streamTypeToCategoryType(type);

  const cacheKey = `xtream:catcanon:${categoryType}`;
  const serialized = await cacheGetOrSet(cacheKey, 120, async () => {
    const cats = await prisma.category.findMany({
      where: { categoryType },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const groups = new Map<string, typeof cats>();
    for (const c of cats) {
      const key = categoryMergeKey(c.name);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }

    const numericByCategoryId: Array<[string, string]> = [];
    const byMergeKey: Array<[string, CanonicalCategoryEntry]> = [];
    const cuidsByNumericId: Array<[string, string[]]> = [];

    for (const [mergeKey, list] of groups) {
      const sorted = [...list].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.name.localeCompare(b.name)
      );
      const canonical =
        sorted.find((c) => c.name.includes("|")) ??
        sorted.find((c) => /\|\s*/.test(c.name)) ??
        sorted[0]!;
      const numericId = numericCategoryId(canonical.id);
      const entry: CanonicalCategoryEntry = {
        categoryId: canonical.id,
        numericId,
        name: canonical.name,
        mergeKey,
      };
      byMergeKey.push([mergeKey, entry]);
      const cuids = list.map((c) => c.id);
      cuidsByNumericId.push([numericId, cuids]);
      for (const c of list) numericByCategoryId.push([c.id, numericId]);
    }

    return { numericByCategoryId, byMergeKey, cuidsByNumericId };
  });

  return {
    numericByCategoryId: new Map(serialized.numericByCategoryId),
    byMergeKey: new Map(serialized.byMergeKey),
    cuidsByNumericId: new Map(serialized.cuidsByNumericId),
  };
}

/** Resolve Xtream numeric category_id to all matching category cuids (merged folders). */
export async function resolveCategoryCuidsForNumericId(
  numericId: string,
  type: StreamType = StreamType.LIVE
): Promise<string[]> {
  const raw = String(numericId ?? "").trim();
  if (!raw || raw === "0") return [];
  const maps = await buildCanonicalCategoryMaps(type);
  const direct = maps.cuidsByNumericId.get(raw);
  if (direct?.length) return direct;

  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return [];
  const cats = await prisma.category.findMany({
    where: { categoryType: streamTypeToCategoryType(type) },
    select: { id: true, name: true },
  });
  const seed = cats.find((c) => cuidToNum(c.id) === n);
  if (!seed) return [];
  const key = categoryMergeKey(seed.name);
  const entry = maps.byMergeKey.get(key);
  if (entry) return maps.cuidsByNumericId.get(entry.numericId) ?? [seed.id];
  return [seed.id];
}

export function canonicalNumericForCategory(
  maps: CanonicalCategoryMaps,
  categoryId?: string | null
): string {
  if (!categoryId) return "0";
  return maps.numericByCategoryId.get(categoryId) ?? numericCategoryId(categoryId);
}
