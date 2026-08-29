#!/usr/bin/env node
const p = require("@prisma/client").PrismaClient;
new p().streamServer.findFirst({ where: { name: "10gbs" }, select: { agentSshPasswordEnc: true, agentUseSsh: true } })
  .then((r) => { console.log(JSON.stringify({ hasPassword: Boolean(r?.agentSshPasswordEnc), agentUseSsh: r?.agentUseSsh })); process.exit(0); });
