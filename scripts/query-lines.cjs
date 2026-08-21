#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.line
  .findMany({
    where: { username: { contains: process.argv[2] || "sn", mode: "insensitive" } },
    select: { username: true, id: true },
    take: 20,
  })
  .then((rows) => {
    console.log(JSON.stringify(rows, null, 2));
    return p.$disconnect();
  });
