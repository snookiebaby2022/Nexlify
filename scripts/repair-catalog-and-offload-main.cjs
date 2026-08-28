#!/usr/bin/env node
/**
 * Offload live streams from the Main (panel) server onto load-balancer nodes.
 * Usage: node scripts/repair-catalog-and-offload-main.cjs
 */
const path = require("path");
require(path.join(__dirname, "load-env.cjs")).loadEnv();
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();

function readRole(settings) {
  if (!settings || typeof settings !== "object") return "";
  const adv = settings.advanced;
  if (adv && typeof adv === "object" && typeof adv.serverRole === "string") {
    return String(adv.serverRole).toLowerCase();
  }
  return "";
}

function isLocalHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

async function pickServers() {
  const servers = await p.streamServer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      host: true,
      sortOrder: true,
      healthStatus: true,
      panelSettings: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const main =
    servers.find((s) => readRole(s.panelSettings) === "main") ||
    servers.find((s) => /^main(\s+server)?$/i.test(String(s.name || ""))) ||
    servers.find((s) => isLocalHost(s.host)) ||
    servers[0];
  const lbs = servers.filter(
    (s) =>
      s.id !== main?.id &&
      readRole(s.panelSettings) !== "main" &&
      s.healthStatus !== "offline"
  );
  return { main, lbs };
}

async function offloadMain() {
  const { main, lbs } = await pickServers();
  if (!main) return { moved: 0, reason: "no servers" };
  if (!lbs.length) return { moved: 0, reason: "no load-balancer servers", main: main.name };

  const counts = [];
  for (const lb of lbs) {
    const n = await p.stream.count({ where: { type: "LIVE", isActive: true, serverId: lb.id } });
    counts.push({ ...lb, n });
  }
  counts.sort((a, b) => a.n - b.n);

  const BATCH = 400;
  let moved = 0;
  for (;;) {
    const batch = await p.stream.findMany({
      where: { type: "LIVE", isActive: true, serverId: main.id },
      select: { id: true },
      take: BATCH,
    });
    if (!batch.length) break;
    const dest = counts[0];
    await p.stream.updateMany({
      where: { id: { in: batch.map((s) => s.id) } },
      data: { serverId: dest.id },
    });
    dest.n += batch.length;
    moved += batch.length;
    counts.sort((a, b) => a.n - b.n);
    if (batch.length < BATCH) break;
  }
  const remaining = await p.stream.count({
    where: { type: "LIVE", isActive: true, serverId: main.id },
  });
  return {
    moved,
    remainingOnMain: remaining,
    main: main.name,
    lbs: counts.map((c) => ({ name: c.name, live: c.n })),
  };
}

(async () => {
  const offload = await offloadMain();
  console.log(JSON.stringify({ offload }, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
