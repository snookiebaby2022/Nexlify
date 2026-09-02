#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  const movie = await p.stream.updateMany({
    where: { type: "MOVIE", isActive: true, NOT: { serverId: server.id } },
    data: { serverId: server.id },
  });
  const series = await p.stream.updateMany({
    where: { type: "SERIES", isActive: true, NOT: { serverId: server.id } },
    data: { serverId: server.id },
  });
  console.log(
    JSON.stringify({
      moved: { movie: movie.count, series: series.count },
      on10gbs: {
        movie: await p.stream.count({ where: { type: "MOVIE", isActive: true, serverId: server.id } }),
        series: await p.stream.count({ where: { type: "SERIES", isActive: true, serverId: server.id } }),
      },
    })
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
