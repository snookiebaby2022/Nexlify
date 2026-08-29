#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.stream
  .count({ where: { type: "LIVE" } })
  .then((n) => console.log("live_streams", n))
  .finally(() => p.$disconnect());
