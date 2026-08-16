/**
 * Server 45-style repair: category folders were wrongly imported as Bouquets.
 * Real bouquets are packages assigned to lines (UK, USA, VOD, ADULT, …).
 * Categories (UK | Entertainment, …) are what IPTV apps list under Live/VOD/Series.
 *
 * This merges stream links from orphan category-named bouquets (0 line assignments)
 * into the matching package bouquet, then deletes those orphan bouquets.
 * Also merges duplicate categories (e.g. "UK Entertainment" → "UK | Entertainment")
 * and copies sortOrder so panel + Xtream apps share the same order.
 */
import type { PrismaClient } from "@prisma/client";
import { invalidateXtreamCategories } from "./cache-invalidate";

export type BouquetCategoryRepairResult = {
  packageBouquets: number;
  orphanBouquets: number;
  streamLinksMerged: number;
  orphanBouquetsDeleted: number;
  categoriesMerged: number;
  streamsRecategorized: number;
  sortOrdersFixed: number;
  unmatchedOrphanBouquets: { name: string; streams: number }[];
};

function normCatName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer the XUI-style "UK | Entertainment" name over heuristic "UK Entertainment". */
function preferCategoryName(a: string, b: string): string {
  const aPipe = a.includes("|");
  const bPipe = b.includes("|");
  if (aPipe && !bPipe) return a;
  if (bPipe && !aPipe) return b;
  // Prefer the one that looks more like the dump (shorter pipe form wins on equal)
  return a.length <= b.length ? a : b;
}

const PACKAGE_RULES: { re: RegExp; packageName: RegExp | string }[] = [
  { re: /adult|xxx/i, packageName: /^ADULT$/i },
  { re: /^247\b|24\/7|xmas/i, packageName: /^24\/7$/i },
  { re: /^vod\b|movie|series/i, packageName: /^VOD$/i },
  { re: /^in(dian)?\b/i, packageName: /^INDIAN$/i },
  { re: /^uk\b|^ie\b|premier sports|football events|uefa|ppv|sky sports|tnt sports|bbc|efa\b|spfl|national league|dazn|discovery\+|hbo max|regionals|asian|religion|shopping|documentar/i, packageName: /UK no XXX/i },
  { re: /^us\b|^ca\b|big 10|fanduel|nhl|nba|mlb|espn|hulu|fubo|amazon events|paramount|ah l\b|ohl\b|sportsnet|cbc regional|flow rush/i, packageName: /^USA$/i },
  { re: /^au\b|kayo|optus|stan sport|nrl|afl/i, packageName: /^AUSTRALIAN$/i },
  { re: /^de\b|german/i, packageName: /^GERMAN$/i },
  { re: /^fr\b|ligue/i, packageName: /^FRANCE$/i },
  { re: /^it\b|italy|rai\b/i, packageName: /^ITALY$/i },
  { re: /^es\b|spain|laliga/i, packageName: /^SPANISH$/i },
  { re: /^pl\b|poland/i, packageName: /^POLISH$/i },
  { re: /^tr\b|turkey/i, packageName: /^TURKEY$/i },
  { re: /^nl\b|netherlands|dutch/i, packageName: /^DUTCH$/i },
  { re: /^pt\b|portugal/i, packageName: /portugal/i },
  { re: /^bg\b|bulgaria/i, packageName: /^BULGARIAN$/i },
  { re: /^ro\b|romania/i, packageName: /^ROMANIAN$/i },
  { re: /^ar\b|arabic/i, packageName: /^ARABIC$/i },
  { re: /^al\b|alban/i, packageName: /^ALBANIAN$/i },
  { re: /^ir\b|iran/i, packageName: /^IRAN$/i },
  { re: /^afri/i, packageName: /^AFRICA$/i },
  { re: /^ch\b|switzerland/i, packageName: /UK no XXX/i }, // often bundled with UK packages
  { re: /^no\b|norway/i, packageName: /UK no XXX/i },
];

function resolvePackageId(
  orphanName: string,
  packages: { id: string; name: string }[]
): string | null {
  for (const rule of PACKAGE_RULES) {
    if (!rule.re.test(orphanName)) continue;
    const pkg = rule.packageName;
    const hit =
      typeof pkg === "string"
        ? packages.find((p) => p.name.toLowerCase() === pkg.toLowerCase())
        : packages.find((p) => pkg.test(p.name));
    if (hit) return hit.id;
  }
  return null;
}

export async function repairBouquetCategorySplit(
  prisma: PrismaClient
): Promise<BouquetCategoryRepairResult> {
  const result: BouquetCategoryRepairResult = {
    packageBouquets: 0,
    orphanBouquets: 0,
    streamLinksMerged: 0,
    orphanBouquetsDeleted: 0,
    categoriesMerged: 0,
    streamsRecategorized: 0,
    sortOrdersFixed: 0,
    unmatchedOrphanBouquets: [],
  };

  const bouquets = await prisma.bouquet.findMany({
    select: {
      id: true,
      name: true,
      sortOrder: true,
      _count: { select: { lines: true, streams: true } },
    },
  });

  const packages = bouquets
    .filter((b) => b._count.lines > 0)
    .map((b) => ({ id: b.id, name: b.name, sortOrder: b.sortOrder }));
  const orphans = bouquets.filter((b) => b._count.lines === 0 && b._count.streams > 0);
  const emptyOrphans = bouquets.filter((b) => b._count.lines === 0 && b._count.streams === 0);

  result.packageBouquets = packages.length;
  result.orphanBouquets = orphans.length;

  const BATCH = 400;
  for (const orphan of orphans) {
    const packageId = resolvePackageId(orphan.name, packages);
    if (!packageId) {
      result.unmatchedOrphanBouquets.push({ name: orphan.name, streams: orphan._count.streams });
      continue;
    }

    const links = await prisma.bouquetStream.findMany({
      where: { bouquetId: orphan.id },
      select: { streamId: true, sortOrder: true },
    });

    for (let i = 0; i < links.length; i += BATCH) {
      const chunk = links.slice(i, i + BATCH);
      const created = await prisma.bouquetStream.createMany({
        data: chunk.map((l) => ({
          bouquetId: packageId,
          streamId: l.streamId,
          sortOrder: l.sortOrder,
        })),
        skipDuplicates: true,
      });
      result.streamLinksMerged += created.count;
    }

    await prisma.bouquetStream.deleteMany({ where: { bouquetId: orphan.id } });
    await prisma.bouquet.delete({ where: { id: orphan.id } });
    result.orphanBouquetsDeleted++;
  }

  // Empty category-named orphans with no streams — delete
  for (const empty of emptyOrphans) {
    // Keep "test" and anything that looks like a real empty package name
    if (/^(test|ppv|events|irish)/i.test(empty.name) && empty.name.length < 40) continue;
    if (!/[|]/.test(empty.name) && empty.name === empty.name.toUpperCase() && empty.name.length < 20) {
      continue; // likely a real empty package acronym
    }
    try {
      await prisma.bouquet.delete({ where: { id: empty.id } });
      result.orphanBouquetsDeleted++;
    } catch {
      /* ignore */
    }
  }

  // Merge duplicate categories (UK Entertainment → UK | Entertainment)
  const cats = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      categoryType: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { streams: true } },
    },
  });

  const groups = new Map<string, typeof cats>();
  for (const c of cats) {
    const key = `${c.categoryType}:${normCatName(c.name)}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Keep preferred name; prefer more streams, then pipe name, then older
    const sorted = [...group].sort((a, b) => {
      const aPipe = a.name.includes("|") ? 1 : 0;
      const bPipe = b.name.includes("|") ? 1 : 0;
      if (bPipe !== aPipe) return bPipe - aPipe;
      if (b._count.streams !== a._count.streams) return b._count.streams - a._count.streams;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keep = sorted[0]!;
    const drop = sorted.slice(1);

    // Best sortOrder among the group (non-zero preferred)
    const bestOrder = [...group].sort((a, b) => {
      if (a.sortOrder === 0 && b.sortOrder !== 0) return 1;
      if (b.sortOrder === 0 && a.sortOrder !== 0) return -1;
      return a.sortOrder - b.sortOrder;
    })[0]!.sortOrder;

    if (keep.sortOrder !== bestOrder && bestOrder !== 0) {
      await prisma.category.update({ where: { id: keep.id }, data: { sortOrder: bestOrder } });
      result.sortOrdersFixed++;
    }

    for (const d of drop) {
      const moved = await prisma.stream.updateMany({
        where: { categoryId: d.id },
        data: { categoryId: keep.id },
      });
      result.streamsRecategorized += moved.count;
      await prisma.category.delete({ where: { id: d.id } });
      result.categoriesMerged++;
    }

    // Rename keep to preferred pipe form if a dropped one had a better name
    const preferred = group.reduce((best, c) =>
      preferCategoryName(best, c.name) === c.name ? c.name : best
    , keep.name);
    if (preferred !== keep.name) {
      await prisma.category.update({ where: { id: keep.id }, data: { name: preferred } });
    }
  }

  // Copy sortOrder from ordered legacy names onto remaining sortOrder=0 pipe cats
  const afterMerge = await prisma.category.findMany({
    select: { id: true, name: true, categoryType: true, sortOrder: true },
  });
  const orderedByNorm = new Map<string, number>();
  for (const c of afterMerge) {
    if (c.sortOrder === 0) continue;
    orderedByNorm.set(`${c.categoryType}:${normCatName(c.name)}`, c.sortOrder);
  }
  for (const c of afterMerge) {
    if (c.sortOrder !== 0) continue;
    const inherited = orderedByNorm.get(`${c.categoryType}:${normCatName(c.name)}`);
    if (inherited == null) continue;
    await prisma.category.update({ where: { id: c.id }, data: { sortOrder: inherited } });
    c.sortOrder = inherited;
    result.sortOrdersFixed++;
  }

  // Assign sequential sortOrder within each type for remaining zeros (stable by name)
  for (const type of ["LIVE", "MOVIE", "SERIES", "RADIO"] as const) {
    const typed = afterMerge
      .filter((c) => c.categoryType === type)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const ordered = typed.filter((c) => c.sortOrder > 0);
    const maxOrdered = ordered.length ? Math.max(...ordered.map((c) => c.sortOrder)) : 0;
    let next = maxOrdered + 10;
    for (const c of typed.filter((c) => c.sortOrder === 0).sort((a, b) => a.name.localeCompare(b.name))) {
      await prisma.category.update({ where: { id: c.id }, data: { sortOrder: next } });
      c.sortOrder = next;
      next += 2;
      result.sortOrdersFixed++;
    }
  }

  // Package bouquet order already has sortOrder 1..N — leave it.
  // Ensure packages sort before any leftover orphans by leaving orphans deleted.

  void invalidateXtreamCategories();
  return result;
}
