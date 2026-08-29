#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.streamServer
  .findMany({
    select: {
      name: true,
      host: true,
      agentToken: true,
      agentUseSsh: true,
      agentSshHost: true,
      agentSshUser: true,
      agentLastSeen: true,
    },
  })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    return p.$disconnect();
  });
