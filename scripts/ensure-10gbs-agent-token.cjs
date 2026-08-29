#!/usr/bin/env node
/** Ensure 10gbs stream server has an agent token. */
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const row = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!row) throw new Error("10gbs server row missing");
  if (row.agentToken) {
    console.log(JSON.stringify({ id: row.id, agentToken: row.agentToken, created: false }));
    await p.$disconnect();
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  await p.streamServer.update({ where: { id: row.id }, data: { agentToken: token } });
  console.log(JSON.stringify({ id: row.id, agentToken: token, created: true }));
  await p.$disconnect();
})();
