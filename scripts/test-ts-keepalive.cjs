#!/usr/bin/env node
const http = require("http");
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();

async function snapshot(lineId, streamId) {
  const row = await p.liveConnection.findFirst({
    where: { lineId, streamId },
    orderBy: { lastSeenAt: "desc" },
    select: { lastSeenAt: true, ip: true },
  });
  if (!row) return null;
  return { ip: row.ip, ageSec: Math.round((Date.now() - +row.lastSeenAt) / 1000) };
}

(async () => {
  const line = await p.line.findFirst({
    where: { username: "test888" },
    select: { id: true, username: true, password: true },
  });
  const stream = await p.stream.findFirst({
    where: { name: { contains: "24-7 Only Fools and Horses", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!line?.password || !stream) throw new Error("missing line/stream");

  const path = `/live/${line.username}/${line.password}/${stream.id}.ts`;
  console.log("GET", path);

  const req = http.get(
    {
      host: "127.0.0.1",
      port: 80,
      path,
      headers: { "user-agent": "VLC/3.0.20", "x-forwarded-for": "203.0.113.77" },
    },
    (res) => {
      console.log("HTTP", res.statusCode, res.headers["content-type"]);
      res.on("data", () => undefined);
    }
  );
  req.on("error", (e) => console.error("req error", e.message));

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const snap = await snapshot(line.id, stream.id);
    console.log(`[${new Date().toISOString()}]`, JSON.stringify(snap));
  }

  req.destroy();
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
