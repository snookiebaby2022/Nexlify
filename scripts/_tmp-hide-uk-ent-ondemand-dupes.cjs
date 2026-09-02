#!/usr/bin/env node
"use strict";
/**
 * Hide ON_DEMAND live duplicates in UK | Entertainment when a LIVE splice
 * copy of the same name already exists. Prints names only.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

(async () => {
  const cat = await prisma.category.findFirst({
    where: { name: "UK | Entertainment" },
    select: { id: true, name: true },
  });
  if (!cat) throw new Error("UK | Entertainment missing");
  const rows = await prisma.stream.findMany({
    where: { type: "LIVE", categoryId: cat.id, isActive: true },
    select: { id: true, name: true, isOnDemand: true, vodMode: true, xtreamNum: true },
  });
  const byName = new Map();
  for (const s of rows) {
    const list = byName.get(s.name) || [];
    list.push(s);
    byName.set(s.name, list);
  }
  const hide = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const live = list.filter((s) => !s.isOnDemand && s.vodMode !== "ON_DEMAND");
    const od = list.filter((s) => s.isOnDemand || s.vodMode === "ON_DEMAND");
    if (!live.length || !od.length) continue;
    for (const s of od) hide.push({ name, id: s.id, xtreamNum: s.xtreamNum });
  }
  console.log(JSON.stringify({ category: cat.name, hideCount: hide.length, hide: hide.slice(0, 80) }));
  if (APPLY && hide.length) {
    const ids = hide.map((h) => h.id);
    const res = await prisma.stream.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    });
    console.log(JSON.stringify({ applied: res.count }));
  } else {
    console.log(APPLY ? "NOTHING_TO_HIDE" : "DRY_RUN");
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
