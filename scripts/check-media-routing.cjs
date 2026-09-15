#!/usr/bin/env node
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const edge = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  console.log(
    JSON.stringify(
      {
        NEXLIFY_MEDIA_ORIGIN: process.env.NEXLIFY_MEDIA_ORIGIN || null,
        edge_domain: edge?.domain || null,
        edge_host: edge?.host || null,
        edge_port: edge?.port || null,
        recommended_lb_origin: edge?.domain
          ? `${edge.protocol || "http"}://${edge.domain}:${edge.port || 8080}`
          : null,
      },
      null,
      2
    )
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
