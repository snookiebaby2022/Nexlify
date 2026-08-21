#!/usr/bin/env node
/** Monitor liveConnection rows for a line while optionally hitting a stream URL. */
const fs = require("fs");
const http = require("http");
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();
const username = process.argv[2] || "snook";
const streamName = process.argv[3] || "Only Fools";
const seconds = Number(process.argv[4] || 90);

function secret() {
  const env = fs.readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    if (!line.startsWith("PANEL_INTERNAL_SECRET=")) continue;
    let v = line.slice("PANEL_INTERNAL_SECRET=".length).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return "";
}

async function snapshot(lineId) {
  const rows = await p.liveConnection.findMany({
    where: { lineId },
    orderBy: { lastSeenAt: "desc" },
    include: { stream: { select: { name: true } } },
  });
  const now = Date.now();
  return rows.map((r) => ({
    stream: r.stream?.name,
    streamId: r.streamId,
    ip: r.ip,
    ageSec: Math.round((now - +r.lastSeenAt) / 1000),
    visible120: now - +r.lastSeenAt <= 120_000,
  }));
}

async function main() {
  let line = null;
  const needle = (process.argv[2] || "").trim();
  if (needle) {
    line = await p.line.findFirst({
      where: { username: { contains: needle, mode: "insensitive" } },
      select: { id: true, username: true, password: true },
    });
  } else {
    line = await p.line.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true, username: true, password: true },
      orderBy: { updatedAt: "desc" },
    });
  }
  const stream = await p.stream.findFirst({
    where: { name: { contains: streamName, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!line) throw new Error(`No line matching ${needle || "(any active)"}`);
  console.log(JSON.stringify({ line: line.username, stream: stream?.name, streamId: stream?.id }, null, 2));

  let req;
  if (line.password && stream?.id) {
    const path = `/live/${line.username}/${line.password}/${stream.id}.m3u8`;
    console.log(`GET http://127.0.0.1${path}`);
    req = http.get({ host: "127.0.0.1", port: 80, path, headers: { "user-agent": "VLC/3.0.20" } }, (res) => {
      console.log(`playlist HTTP ${res.statusCode}`);
      res.resume();
    });
    req.on("error", (e) => console.error("playlist error", e.message));
  }

  for (let i = 0; i < seconds / 5; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const rows = await snapshot(line.id);
    console.log(`[${new Date().toISOString()}]`, JSON.stringify(rows));
  }

  req?.destroy();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
