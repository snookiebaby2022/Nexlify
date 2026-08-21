#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function normalizeConnectionIp(ip) {
  const raw = (ip ?? "").trim();
  if (!raw || raw === "127.0.0.1" || raw === "::1") return null;
  return raw;
}

async function countCapacitySessions(lineId, clientIp) {
  const staleBefore = new Date(Date.now() - 60_000);
  const normalized = normalizeConnectionIp(clientIp);
  const where = { lineId, lastSeenAt: { gte: staleBefore } };
  if (normalized) {
    where.NOT = { OR: [{ ip: null }, { ip: "" }, { ip: "127.0.0.1" }, { ip: "::1" }] };
  }
  const result = await p.liveConnection.groupBy({ by: ["streamId"], where });
  return result.length;
}

async function lineHasConnectionCapacity(lineId, maxConnections, opts = {}) {
  if (maxConnections <= 0) return true;
  const clientIp = normalizeConnectionIp(opts.clientIp);
  const staleBefore = new Date(Date.now() - 60_000);
  if (opts.streamId && clientIp) {
    const sameStream = await p.liveConnection.findFirst({
      where: {
        lineId,
        streamId: opts.streamId,
        OR: clientIp ? [{ ip: clientIp }] : [{ ip: null }, { ip: "" }],
        lastSeenAt: { gte: staleBefore },
      },
    });
    if (sameStream) return true;
  }
  if (clientIp) {
    const clientSessions = await p.liveConnection.groupBy({
      by: ["streamId"],
      where: {
        lineId,
        OR: [{ ip: clientIp }],
        lastSeenAt: { gte: staleBefore },
      },
    });
    if (clientSessions.length > 0) return clientSessions.length <= maxConnections;
  }
  const active = await countCapacitySessions(lineId, clientIp);
  return active < maxConnections;
}

async function main() {
  const line = await p.line.findUnique({ where: { username: "_smoke_test" } });
  const streamId = "cmstw2mejj94yvhyagpdlfbvw";
  const ip = "203.0.113.50";
  const ok = await lineHasConnectionCapacity(line.id, line.maxConnections, { streamId, clientIp: ip });
  const active = await countCapacitySessions(line.id, ip);
  const rows = await p.liveConnection.findMany({ where: { lineId: line.id, lastSeenAt: { gte: new Date(Date.now() - 120_000) } } });
  console.log(JSON.stringify({ ok, active, max: line.maxConnections, rows }, null, 2));
  await p.$disconnect();
}

main();
