#!/usr/bin/env node
/** Point nginx-fronted catalog at 10gbs — panel nginx proxies /live /movie /series there. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!server) throw new Error("10gbs not found");
  const live = await p.stream.updateMany({
    where: { type: "LIVE", isActive: true, NOT: { serverId: server.id } },
    data: { serverId: server.id },
  });
  const movie = await p.stream.updateMany({
    where: { type: "MOVIE", isActive: true, NOT: { serverId: server.id } },
    data: { serverId: server.id },
  });
  const series = await p.stream.updateMany({
    where: { type: "SERIES", isActive: true, NOT: { serverId: server.id } },
    data: { serverId: server.id },
  });
  console.log(
    JSON.stringify(
      {
        serverId: server.id,
        moved: { live: live.count, movie: movie.count, series: series.count },
        on10gbs: {
          live: await p.stream.count({ where: { type: "LIVE", isActive: true, serverId: server.id } }),
          movie: await p.stream.count({ where: { type: "MOVIE", isActive: true, serverId: server.id } }),
          series: await p.stream.count({ where: { type: "SERIES", isActive: true, serverId: server.id } }),
        },
      },
      null,
      2
    )
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
