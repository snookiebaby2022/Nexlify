#!/usr/bin/env node
"use strict";
/**
 * Scan all UK live categories for ON_DEMAND duplicates when a LIVE splice
 * copy of the same name already exists in that category. Dry-run by default.
 *   node scripts/hide-uk-ondemand-dupes.cjs
 *   node scripts/hide-uk-ondemand-dupes.cjs --apply
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

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function scanCategory(cat, rows) {
  const byName = new Map();
  for (const s of rows) {
    const list = byName.get(s.name) || [];
    list.push(s);
    byName.set(s.name, list);
  }
  const hide = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const live = list.filter(isLiveSplice);
    const od = list.filter(isOnDemandLive);
    if (!live.length || !od.length) continue;
    for (const s of od) {
      hide.push({
        category: cat.name,
        name,
        id: s.id,
        xtreamNum: s.xtreamNum,
        host: hostOf(s.streamUrl),
        keepHosts: [...new Set(live.map((x) => hostOf(x.streamUrl)).filter(Boolean))],
      });
    }
  }
  return hide;
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

  const allHide = [];
  const perCategory = [];

  for (const cat of categories) {
    const rows = await prisma.stream.findMany({
      where: { type: "LIVE", categoryId: cat.id, isActive: true },
      select: {
        id: true,
        name: true,
        isOnDemand: true,
        vodMode: true,
        xtreamNum: true,
        streamUrl: true,
      },
    });
    if (!rows.length) continue;
    const hide = scanCategory(cat, rows);
    const liveSplice = rows.filter(isLiveSplice).length;
    const onDemand = rows.filter(isOnDemandLive).length;
    perCategory.push({
      category: cat.name,
      active: rows.length,
      liveSplice,
      onDemand,
      hideCount: hide.length,
    });
    allHide.push(...hide);
  }

  const byHost = {};
  for (const h of allHide) {
    const k = h.host || "(none)";
    byHost[k] = (byHost[k] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry_run",
        categoriesScanned: perCategory.length,
        totalHide: allHide.length,
        hideByOriginHost: byHost,
        perCategory: perCategory.filter((c) => c.hideCount > 0 || c.onDemand > 0),
      },
      null,
      2
    )
  );

  if (allHide.length) {
    console.log("=== sample (first 60) ===");
    console.log(JSON.stringify(allHide.slice(0, 60), null, 2));
  }

  if (APPLY && allHide.length) {
    const ids = [...new Set(allHide.map((h) => h.id))];
    const res = await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    });
    console.log(JSON.stringify({ applied: res.count, uniqueIds: ids.length }));
  } else if (!APPLY) {
    console.log("DRY_RUN — pass --apply to deactivate on-demand duplicates");
  } else {
    console.log("NOTHING_TO_HIDE");
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
