#!/usr/bin/env node
"use strict";
/**
 * Undo hide-uk-ondemand-dupes.cjs: reactivate inactive on-demand UK live rows
 * that still have an active live-splice twin with the same name in the category.
 *   node scripts/restore-uk-ondemand-dupes.cjs
 *   node scripts/restore-uk-ondemand-dupes.cjs --apply
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function isLiveSplice(s) {
  return !s.isOnDemand && s.vodMode !== "ON_DEMAND";
}

function isOnDemandLive(s) {
  return s.isOnDemand || s.vodMode === "ON_DEMAND";
}

function scanCategory(cat, rows) {
  const byName = new Map();
  for (const s of rows) {
    const list = byName.get(s.name) || [];
    list.push(s);
    byName.set(s.name, list);
  }
  const restore = [];
  for (const [name, list] of byName) {
    const liveActive = list.filter((s) => isLiveSplice(s) && s.isActive);
    const odInactive = list.filter((s) => isOnDemandLive(s) && !s.isActive);
    if (!liveActive.length || !odInactive.length) continue;
    for (const s of odInactive) {
      restore.push({
        category: cat.name,
        name,
        id: s.id,
        xtreamNum: s.xtreamNum,
      });
    }
  }
  return restore;
}

(async () => {
  const categories = await prisma.category.findMany({
    where: {
      categoryType: "LIVE",
      OR: [
        { name: { startsWith: "UK |" } },
        { name: { startsWith: "UK|" } },
        { name: { contains: "UK |", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const allRestore = [];
  const perCategory = [];

  for (const cat of categories) {
    const rows = await prisma.stream.findMany({
      where: { type: "LIVE", categoryId: cat.id },
      select: {
        id: true,
        name: true,
        isActive: true,
        isOnDemand: true,
        vodMode: true,
        xtreamNum: true,
        streamUrl: true,
      },
    });
    if (!rows.length) continue;
    const restore = scanCategory(cat, rows);
    perCategory.push({
      category: cat.name,
      restoreCount: restore.length,
    });
    allRestore.push(...restore);
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry_run",
        totalRestore: allRestore.length,
        perCategory: perCategory.filter((c) => c.restoreCount > 0),
      },
      null,
      2
    )
  );

  if (allRestore.length) {
    console.log("=== sample (first 40) ===");
    console.log(JSON.stringify(allRestore.slice(0, 40), null, 2));
  }

  if (APPLY && allRestore.length) {
    const ids = [...new Set(allRestore.map((r) => r.id))];
    const res = await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { isActive: true },
    });
    console.log(JSON.stringify({ restored: res.count, uniqueIds: ids.length }));
  } else if (!APPLY) {
    console.log("DRY_RUN — pass --apply to reactivate");
  } else {
    console.log("NOTHING_TO_RESTORE");
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
