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
import { categoryMergeKey } from "./category-options";
import { invalidateXtreamCategories } from "./cache-invalidate";

export type BouquetCategoryRepairResult = {
  packageBouquets: number;
  orphanBouquets: number;
  streamLinksMerged: number;
  orphanBouquetsDeleted: number;
  categoriesMerged: number;
  streamsRecategorized: number;
  sortOrdersFixed: number;
  orphanLiveLinked?: number;
  orphanLiveSkipped?: number;
  bouquetSortSynced?: number;
  unmatchedOrphanBouquets: { name: string; streams: number }[];
};

function normCatName(name: string): string {
  return categoryMergeKey(name);
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
  { re: /adult|xxx/i, packageName: /^(XXX|ADULT)$/i },
  { re: /^247\b|24\/7|xmas/i, packageName: /^24\/7$/i },
  { re: /^vod\b|movie|series|tv series/i, packageName: /^(Movies|TV Series|VOD)$/i },
  { re: /^live\s*tv\b/i, packageName: /^Live TV$/i },
  { re: /^international\b/i, packageName: /^International$/i },
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
  { re: /^afri|za\b|dstv|supersport/i, packageName: /^AFRICA$/i },
  { re: /^ch\b|switzerland/i, packageName: /UK no XXX/i }, // often bundled with UK packages
  { re: /^no\b|norway/i, packageName: /UK no XXX/i },
  { re: /^jp\b|^hk\b|^id\b|^my\b|^nz\b|coupang|star\+|monomax|now hk/i, packageName: /^International$/i },
];

/** Prefer these when resolving movie/series orphans into type packages. */
function resolvePackageIdPrefer(
  orphanName: string,
  packages: { id: string; name: string }[]
): string | null {
  const lower = orphanName.toLowerCase();
  if (/movie/i.test(lower)) {
    const hit = packages.find((p) => /^Movies$/i.test(p.name)) ?? packages.find((p) => /^VOD$/i.test(p.name));
    if (hit) return hit.id;
  }
  if (/series|tv series/i.test(lower)) {
    const hit = packages.find((p) => /^TV Series$/i.test(p.name)) ?? packages.find((p) => /^VOD$/i.test(p.name));
    if (hit) return hit.id;
  }
  if (/^live\s*tv$/i.test(lower) || (/^247\b|24\/7/i.test(lower) && !/adult|xxx/i.test(lower))) {
    const hit = packages.find((p) => /^Live TV$/i.test(p.name));
    if (hit) return hit.id;
  }
  return resolvePackageId(orphanName, packages);
}

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

/** Link live streams with no bouquet rows (common after dedupe) into package bouquets by category name. */
export async function repairOrphanLiveBouquetLinks(
  prisma: PrismaClient,
  bouquets: { id: string; name: string }[]
): Promise<{ linked: number; skipped: number }> {
  let linked = 0;
  let skipped = 0;
  const BATCH = 400;
  let cursor: string | undefined;

  for (;;) {
    const orphans = await prisma.stream.findMany({
      where: { type: "LIVE", isActive: true, bouquets: { none: {} } },
      select: {
        id: true,
        sortOrder: true,
        category: { select: { name: true } },
      },
      take: BATCH,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!orphans.length) break;
    cursor = orphans[orphans.length - 1]!.id;

    const rows: { bouquetId: string; streamId: string; sortOrder: number }[] = [];
    for (const s of orphans) {
      const label = s.category?.name ?? "";
      const bouquetId =
        resolvePackageIdPrefer(label, bouquets) ??
        resolvePackageId(label, bouquets) ??
        bouquets.find((b) => /^Live TV$/i.test(b.name))?.id ??
        bouquets.find((b) => /UK no XXX/i.test(b.name))?.id ??
        null;
      if (!bouquetId) {
        skipped++;
        continue;
      }
      rows.push({ bouquetId, streamId: s.id, sortOrder: s.sortOrder });
    }
    if (rows.length) {
      const created = await prisma.bouquetStream.createMany({ data: rows, skipDuplicates: true });
      linked += created.count;
    }
  }

  return { linked, skipped };
}

/** Align bouquet stream order with stream.sortOrder so Xtream apps match category order. */
export async function syncLiveBouquetStreamSortOrders(prisma: PrismaClient): Promise<number> {
  const updated = await prisma.$executeRaw`
    UPDATE "BouquetStream" AS bs
    SET "sortOrder" = s."sortOrder"
    FROM "Stream" AS s
    WHERE bs."streamId" = s.id
      AND s.type = 'LIVE'::"StreamType"
      AND s."isActive" = true
      AND bs."sortOrder" <> s."sortOrder"
  `;
  return Number(updated) || 0;
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
    const packageId =
      resolvePackageIdPrefer(orphan.name, packages) ??
      packages.find((p) => /^Live TV$/i.test(p.name))?.id ??
      packages.find((p) => /UK no XXX/i.test(p.name))?.id ??
      packages[0]?.id ??
      null;
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

  // Empty leftovers — keep known dump empty packages; delete category-like names
  for (const empty of emptyOrphans) {
    const name = empty.name.trim();
    const looksLikeCategory =
      /[|]/.test(name) ||
      /\b(UK|US|AU|CA|DE|FR|IT|ES|PL|TR|NL|PT|BG|RO|AR|IE|ZA|JP|HK|MY|NZ)\s*\|/i.test(name) ||
      name.length > 48;
    const keepEmptyPackage =
      !looksLikeCategory &&
      (/^(test|ppv|btsports)$/i.test(name) ||
        /^(IRISH AND RADIO|US SPORT|EVENTS\b)/i.test(name) ||
        (!/[|]/.test(name) && name === name.toUpperCase() && name.length < 24));
    if (keepEmptyPackage) continue;
    try {
      await prisma.lineBouquet.deleteMany({ where: { bouquetId: empty.id } });
      await prisma.resellerBouquet.deleteMany({ where: { bouquetId: empty.id } });
      await prisma.bouquetStream.deleteMany({ where: { bouquetId: empty.id } });
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

  // Assign sequential sortOrder within each type for remaining zeros.
  // Keep them near the top of the unordered band (after existing ordered cats),
  // not at huge offsets that bury common folders like "UK | Entertainment".
  for (const type of ["LIVE", "MOVIE", "SERIES", "RADIO"] as const) {
    const typed = afterMerge.filter((c) => c.categoryType === type);
    const zeros = typed.filter((c) => c.sortOrder === 0).sort((a, b) => a.name.localeCompare(b.name));
    if (!zeros.length) continue;
    // Place unordered cats starting at 0,1,2… but skip values already taken
    const taken = new Set(typed.filter((c) => c.sortOrder !== 0).map((c) => c.sortOrder));
    let next = 0;
    for (const c of zeros) {
      while (taken.has(next)) next += 1;
      await prisma.category.update({ where: { id: c.id }, data: { sortOrder: next } });
      c.sortOrder = next;
      taken.add(next);
      next += 1;
      result.sortOrdersFixed++;
    }
  }

  // Package bouquet order already has sortOrder 1..N — leave it.
  // Ensure packages sort before any leftover orphans by leaving orphans deleted.

  const packageList = bouquets
    .filter((b) => b._count.lines > 0)
    .map((b) => ({ id: b.id, name: b.name }));
  const orphanLive = await repairOrphanLiveBouquetLinks(prisma, packageList.length ? packageList : bouquets.map((b) => ({ id: b.id, name: b.name })));
  result.orphanLiveLinked = orphanLive.linked;
  result.orphanLiveSkipped = orphanLive.skipped;
  result.bouquetSortSynced = await syncLiveBouquetStreamSortOrders(prisma);

  void invalidateXtreamCategories();
  return result;
}
