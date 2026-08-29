#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const hosts = await p.$queryRawUnsafe(`
    SELECT lower(split_part(regexp_replace("streamUrl", '^https?://', ''), '/', 1)) AS host,
           COUNT(*)::int AS n
    FROM "Stream"
    WHERE type = 'LIVE' AND "streamUrl" ~* '^https?://'
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 12
  `);
  const servers = await p.streamServer.findMany({
    select: { id: true, name: true, host: true, isActive: true, proxy: { select: { host: true, port: true, isActive: true } } },
    take: 10,
  });
  console.log(JSON.stringify({ hosts, servers }, null, 2));
  await p.$disconnect();
})();
