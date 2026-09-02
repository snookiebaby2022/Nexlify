#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function cuidToNum(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

(async () => {
  const nullLive = await p.stream.count({ where: { type: "LIVE", isActive: true, xtreamNum: null } });
  const live = await p.stream.count({ where: { type: "LIVE", isActive: true } });
  const ids = [1737131161, 19572196, 727440345, 108101847];
  const byNum = {};
  for (const n of ids) {
    const rows = await p.stream.findMany({
      where: { xtreamNum: n, isActive: true },
      select: { id: true, name: true, type: true, serverId: true, xtreamNum: true },
      take: 12,
    });
    byNum[n] = rows.map((r) => ({
      name: r.name,
      type: r.type,
      id: r.id,
      hash: cuidToNum(r.id),
      hashMatch: cuidToNum(r.id) === n,
      serverId: r.serverId,
    }));
  }
  const line = await p.line.findUnique({
    where: { username: "Joemc9999" },
    select: { id: true, username: true },
  });
  let joe = null;
  if (line) {
    const sample = await p.$queryRaw`
      SELECT s.id, s.name, s."xtreamNum", s."serverId"
      FROM "LineBouquet" lb
      INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
      INNER JOIN "Stream" s ON s.id = bs."streamId"
      WHERE lb."lineId" = ${line.id} AND s.type = 'LIVE' AND s."isActive" = true
      LIMIT 5
    `;
    joe = {
      id: line.id,
      bouquetLiveSample: sample.map((s) => ({
        name: s.name,
        xtreamNum: s.xtreamNum,
        hash: cuidToNum(s.id),
        match: s.xtreamNum === cuidToNum(s.id),
      })),
    };
  }
  const ten = await p.streamServer.findFirst({ where: { name: "10gbs" }, select: { id: true } });
  const on10 = await p.stream.count({ where: { type: "LIVE", isActive: true, serverId: ten.id } });
  const unassigned = await p.stream.count({ where: { type: "LIVE", isActive: true, serverId: null } });
  console.log(JSON.stringify({ live, nullLive, on10, unassigned, tenId: ten.id, byNum, joe }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
