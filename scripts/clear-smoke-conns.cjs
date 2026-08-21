#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.line
  .findUnique({ where: { username: "_smoke_test" } })
  .then(async (line) => {
    if (!line) return;
    const r = await p.liveConnection.deleteMany({ where: { lineId: line.id } });
    console.log("cleared", r.count);
    await p.$disconnect();
  });
