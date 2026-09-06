#!/usr/bin/env node
const fs = require("fs");
const path = "/opt/nexlify-panel/src/lib/cron-jobs.ts";
let s = fs.readFileSync(path, "utf8");
const old = `    const offlineBefore = new Date(Date.now() - 300_000);
    await prisma.streamServer.updateMany({
      where: {
        agentToken: { not: null },
        agentLastSeen: { lt: offlineBefore },
        healthStatus: "online",
      },
      data: {
        healthStatus: "offline",
        healthMessage: "Agent not seen for 5+ minutes",
      },
    });`;
const neu = `    // Mark remote agents offline when heartbeats stop — never the local panel host.
    // Under panel CPU load, agent POSTs time out and Main Server was falsely flipping offline.
    const offlineBefore = new Date(Date.now() - 300_000);
    const { isLocalPanelHost } = await import("./panel-local-server");
    const staleAgents = await prisma.streamServer.findMany({
      where: {
        agentToken: { not: null },
        agentLastSeen: { lt: offlineBefore },
        healthStatus: "online",
      },
      select: { id: true, host: true },
    });
    const remoteStaleIds = staleAgents
      .filter((s) => !isLocalPanelHost(s.host))
      .map((s) => s.id);
    if (remoteStaleIds.length) {
      await prisma.streamServer.updateMany({
        where: { id: { in: remoteStaleIds } },
        data: {
          healthStatus: "offline",
          healthMessage: "Agent not seen for 5+ minutes",
        },
      });
    }
    const localStaleIds = staleAgents
      .filter((s) => isLocalPanelHost(s.host))
      .map((s) => s.id);
    if (localStaleIds.length) {
      await prisma.streamServer.updateMany({
        where: { id: { in: localStaleIds } },
        data: {
          healthStatus: "online",
          healthMessage: "Main server (panel) — agent heartbeat optional",
          lastHealthAt: new Date(),
        },
      });
    }`;
if (!s.includes(old)) {
  if (s.includes("never the local panel host")) {
    console.log("already_patched");
    process.exit(0);
  }
  console.error("OLD_BLOCK_NOT_FOUND");
  process.exit(1);
}
s = s.replace(old, neu);
fs.writeFileSync(path, s);
console.log("patched_ok");
