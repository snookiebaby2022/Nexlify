import type { PrismaClient, PanelRole } from "@prisma/client";
import { inferPackageDaysFromName, packageDurationSortKey } from "@/lib/package-days";
import { ensureStandardUserGroups } from "@/lib/ensure-user-groups";
import { packageLabelForDays, STANDARD_PACKAGE_TEMPLATES } from "@/lib/package-credits";

export type RepairImportedPanelResult = {
  streamsActivated: number;
  packagesFixed: number;
  categoriesRetyped: number;
  seriesCategorized: number;
  liveCategorized: number;
  movieCategorized: number;
  subResellersPromoted: number;
  groupsEnsured: string[];
  bouquetsAlphaSorted: number;
  categoriesAlphaSorted: number;
  standardPackagesEnsured: number;
  seriesLinkedToBouquets: number;
  moviesLinkedToBouquets: number;
};

/**
 * Post-import repairs so the IPTV panel is usable:
 * activate streams, fix package days, roles/groups, category types, alpha order.
 */
export async function repairImportedPanel(prisma: PrismaClient): Promise<RepairImportedPanelResult> {
  const result: RepairImportedPanelResult = {
    streamsActivated: 0,
    packagesFixed: 0,
    categoriesRetyped: 0,
    seriesCategorized: 0,
    liveCategorized: 0,
    movieCategorized: 0,
    subResellersPromoted: 0,
    groupsEnsured: [],
    bouquetsAlphaSorted: 0,
    categoriesAlphaSorted: 0,
    standardPackagesEnsured: 0,
    seriesLinkedToBouquets: 0,
    moviesLinkedToBouquets: 0,
  };

  const activated = await prisma.stream.updateMany({
    where: { isActive: false },
    data: { isActive: true },
  });
  result.streamsActivated = activated.count;

  const packages = await prisma.package.findMany();
  for (const pkg of packages) {
    const days = inferPackageDaysFromName(pkg.name, pkg.days) ?? pkg.days;
    const sortOrder = packageDurationSortKey(days, pkg.name);
    if (days !== pkg.days || sortOrder !== pkg.sortOrder) {
      await prisma.package.update({
        where: { id: pkg.id },
        data: { days, sortOrder },
      });
      result.packagesFixed++;
    }
  }

  // Ensure standard trial→12mo packages exist (in addition to imported ones).
  for (const tpl of STANDARD_PACKAGE_TEMPLATES) {
    const exists = await prisma.package.findFirst({
      where: { OR: [{ name: tpl.name }, { days: tpl.days, creditCost: tpl.creditCost }] },
    });
    if (exists) continue;
    await prisma.package.create({
      data: {
        name: tpl.name,
        description: `${packageLabelForDays(tpl.days)} · ${tpl.creditCost} credit(s)`,
        days: tpl.days,
        creditCost: tpl.creditCost,
        maxLines: 1,
        sortOrder: tpl.days,
        isActive: true,
      },
    });
    result.standardPackagesEnsured++;
  }

  // Re-type categories from majority of linked stream types.
  const cats = await prisma.category.findMany({
    include: { streams: { select: { type: true }, take: 500 } },
  });
  for (const cat of cats) {
    if (!cat.streams.length) continue;
    const counts = { LIVE: 0, MOVIE: 0, SERIES: 0, RADIO: 0 };
    for (const s of cat.streams) {
      if (s.type in counts) counts[s.type as keyof typeof counts]++;
    }
    const best = (Object.entries(counts) as [keyof typeof counts, number][])
      .sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0 && best[0] !== cat.categoryType) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { categoryType: best[0] },
      });
      result.categoriesRetyped++;
    }
  }

  // Bucket generic "Series NNNNN" episodes under TV Series → Imported (avoid 10k cats).
  const importedSeriesRoot = await prisma.category.findFirst({
    where: { name: "TV Series", categoryType: "SERIES", parentId: null },
  });
  let seriesRootId = importedSeriesRoot?.id;
  if (!seriesRootId) {
    const created = await prisma.category.create({
      data: { name: "TV Series", categoryType: "SERIES", sortOrder: 0 },
    });
    seriesRootId = created.id;
  }
  let importedSeriesCat = await prisma.category.findFirst({
    where: { name: "Imported", categoryType: "SERIES", parentId: seriesRootId },
  });
  if (!importedSeriesCat) {
    importedSeriesCat = await prisma.category.create({
      data: { name: "Imported", categoryType: "SERIES", parentId: seriesRootId, sortOrder: 9999 },
    });
  }
  const seriesFix = await prisma.stream.updateMany({
    where: { type: "SERIES", categoryId: null },
    data: { categoryId: importedSeriesCat.id },
  });
  result.seriesCategorized = seriesFix.count;

  const moviesRoot =
    (await prisma.category.findFirst({
      where: { name: "Movies", categoryType: "MOVIE", parentId: null },
    })) ??
    (await prisma.category.create({
      data: { name: "Movies", categoryType: "MOVIE", sortOrder: 0 },
    }));
  const movieFix = await prisma.stream.updateMany({
    where: { type: "MOVIE", categoryId: null },
    data: { categoryId: moviesRoot.id },
  });
  result.movieCategorized = movieFix.count;

  const liveUncat =
    (await prisma.category.findFirst({
      where: { name: "Uncategorized", categoryType: "LIVE", parentId: null },
    })) ??
    (await prisma.category.create({
      data: { name: "Uncategorized", categoryType: "LIVE", sortOrder: 9999 },
    }));
  const liveFix = await prisma.stream.updateMany({
    where: { type: "LIVE", categoryId: null },
    data: { categoryId: liveUncat.id },
  });
  result.liveCategorized = liveFix.count;

  // Promote resellers with a parent to SUB_RESELLER.
  const withParent = await prisma.panelUser.findMany({
    where: { parentId: { not: null }, role: "RESELLER" },
    select: { id: true },
  });
  if (withParent.length) {
    const upd = await prisma.panelUser.updateMany({
      where: { id: { in: withParent.map((u) => u.id) } },
      data: { role: "SUB_RESELLER" as PanelRole },
    });
    result.subResellersPromoted = upd.count;
  }

  const groups = await ensureStandardUserGroups(prisma);
  result.groupsEnsured = [...groups.keys()];

  // Assign users to Reseller / Sub-reseller groups when missing.
  const resellerGroupId = groups.get("Resellers");
  const subGroupId = groups.get("Sub-resellers");
  const adminGroupId = groups.get("Administrators");
  if (resellerGroupId) {
    await prisma.panelUser.updateMany({
      where: { role: "RESELLER", groupId: null },
      data: { groupId: resellerGroupId },
    });
  }
  if (subGroupId) {
    await prisma.panelUser.updateMany({
      where: { role: "SUB_RESELLER", groupId: null },
      data: { groupId: subGroupId },
    });
  }
  if (adminGroupId) {
    await prisma.panelUser.updateMany({
      where: { role: "ADMIN", groupId: null },
      data: { groupId: adminGroupId },
    });
  }

  // Alphabetical sortOrder for bouquets & categories (player default).
  const bouquets = await prisma.bouquet.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  for (let i = 0; i < bouquets.length; i++) {
    await prisma.bouquet.update({ where: { id: bouquets[i].id }, data: { sortOrder: i + 1 } });
    result.bouquetsAlphaSorted++;
  }
  for (const type of ["LIVE", "MOVIE", "SERIES", "RADIO"] as const) {
    const list = await prisma.category.findMany({
      where: { categoryType: type },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < list.length; i++) {
      await prisma.category.update({ where: { id: list[i].id }, data: { sortOrder: i + 1 } });
      result.categoriesAlphaSorted++;
    }
  }

  // Import often maps only live/movie IDs into bouquets — series episodes never appear in players.
  // Attach orphan SERIES (and unlinked MOVIE) streams into VOD-like bouquets.
  const vodBouquet =
    bouquets.find((b) => /^vod$/i.test(b.name.trim())) ||
    bouquets.find((b) => /vod|movie|series|film/i.test(b.name)) ||
    null;

  async function linkOrphansToBouquet(
    type: "SERIES" | "MOVIE",
    bouquetId: string
  ): Promise<number> {
    const orphans = await prisma.stream.findMany({
      where: {
        type,
        isActive: true,
        bouquets: { none: {} },
      },
      select: { id: true },
      take: 50_000,
    });
    if (!orphans.length) return 0;
    let linked = 0;
    const BATCH = 500;
    for (let i = 0; i < orphans.length; i += BATCH) {
      const chunk = orphans.slice(i, i + BATCH);
      const res = await prisma.bouquetStream.createMany({
        data: chunk.map((s, idx) => ({
          bouquetId,
          streamId: s.id,
          sortOrder: i + idx,
        })),
        skipDuplicates: true,
      });
      linked += res.count;
    }
    return linked;
  }

  if (vodBouquet) {
    result.seriesLinkedToBouquets = await linkOrphansToBouquet("SERIES", vodBouquet.id);
    result.moviesLinkedToBouquets = await linkOrphansToBouquet("MOVIE", vodBouquet.id);
  } else if (bouquets[0]) {
    // Fallback: first bouquet alphabetically
    result.seriesLinkedToBouquets = await linkOrphansToBouquet("SERIES", bouquets[0].id);
    result.moviesLinkedToBouquets = await linkOrphansToBouquet("MOVIE", bouquets[0].id);
  }

  return result;
}
