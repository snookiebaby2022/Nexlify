import type { PrismaClient, PanelRole } from "@prisma/client";
import { inferPackageDaysFromName, packageDurationSortKey } from "@/lib/package-days";
import { ensureStandardUserGroups } from "@/lib/ensure-user-groups";
import { packageLabelForDays, STANDARD_PACKAGE_TEMPLATES } from "@/lib/package-credits";
import { reassignUncategorizedLiveStreams } from "@/lib/reassign-uncategorized-live";

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
  liveLinkedToBouquets: number;
  linesLinkedToBouquets: number;
  resellerBouquetsGranted: number;
  uncategorizedReassigned: number;
  uncategorizedRemaining: number;
};

/**
 * Post-import repairs so the IPTV panel is usable:
 * activate streams, fix package days, roles/groups, category types.
 * Does NOT re-sort bouquets/categories alphabetically — dump order is preserved.
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
    liveLinkedToBouquets: 0,
    linesLinkedToBouquets: 0,
    resellerBouquetsGranted: 0,
    uncategorizedReassigned: 0,
    uncategorizedRemaining: 0,
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

  const reassigned = await reassignUncategorizedLiveStreams(prisma);
  result.uncategorizedReassigned = reassigned.moved;
  result.uncategorizedRemaining = reassigned.remaining;

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
  // DISABLED: wipes dump bouquet_order / cat_order after migrate. Keep SQL dump order.
  // Operators who want A→Z can sort manually in Manage Bouquets / Categories.
  const bouquets = await prisma.bouquet.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  // Leave bouquet/category sortOrder unchanged (preserve migrate/SQL dump order).
  result.bouquetsAlphaSorted = 0;
  result.categoriesAlphaSorted = 0;

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
    result.seriesLinkedToBouquets = await linkOrphansToBouquet("SERIES", bouquets[0].id);
    result.moviesLinkedToBouquets = await linkOrphansToBouquet("MOVIE", bouquets[0].id);
  }

  const liveOrphans = await prisma.stream.findMany({
    where: { type: "LIVE", isActive: true, bouquets: { none: {} } },
    select: { id: true },
    take: 50_000,
  });
  if (liveOrphans.length && bouquets.length) {
    const empty: { id: string }[] = [];
    for (const b of bouquets) {
      const n = await prisma.bouquetStream.count({ where: { bouquetId: b.id } });
      if (n === 0) empty.push({ id: b.id });
    }
    const catchAll = bouquets.filter((b) =>
      /all|full|imported|complete|\bmain\b/i.test(b.name)
    );
    const targets = empty.length ? empty : catchAll.length ? catchAll : [bouquets[0]];
    const BATCH = 500;
    let linked = 0;
    for (const t of targets) {
      for (let i = 0; i < liveOrphans.length; i += BATCH) {
        const chunk = liveOrphans.slice(i, i + BATCH);
        const res = await prisma.bouquetStream.createMany({
          data: chunk.map((s, idx) => ({
            bouquetId: t.id,
            streamId: s.id,
            sortOrder: i + idx,
          })),
          skipDuplicates: true,
        });
        linked += res.count;
      }
    }
    result.liveLinkedToBouquets = linked;
  }

  // Lines with no bouquets see zero streams in players even when channels imported.
  if (bouquets.length) {
    const orphanLines = await prisma.line.findMany({
      where: { bouquets: { none: {} } },
      select: { id: true },
    });
    if (orphanLines.length) {
      const bouquetIds = bouquets.map((b) => b.id);
      for (const line of orphanLines) {
        const res = await prisma.lineBouquet.createMany({
          data: bouquetIds.map((bouquetId) => ({ lineId: line.id, bouquetId })),
          skipDuplicates: true,
        });
        result.linesLinkedToBouquets += res.count;
      }
    }
  }

  // Resellers with zero bouquet access cannot create lines or browse content.
  // Grant all active bouquets to reseller/sub-reseller accounts that have none.
  const resellerUsers = await prisma.panelUser.findMany({
    where: { role: { in: ["RESELLER", "SUB_RESELLER"] }, isActive: true },
    select: {
      id: true,
      _count: { select: { resellerBouquets: true } },
    },
  });
  const activeBouquetIds = (
    await prisma.bouquet.findMany({
      where: { isActive: true },
      select: { id: true },
    })
  ).map((b) => b.id);
  if (activeBouquetIds.length) {
    for (const u of resellerUsers) {
      if (u._count.resellerBouquets > 0) continue;
      const res = await prisma.resellerBouquet.createMany({
        data: activeBouquetIds.map((bouquetId) => ({ userId: u.id, bouquetId })),
        skipDuplicates: true,
      });
      result.resellerBouquetsGranted += res.count;
    }
  }

  return result;
}
