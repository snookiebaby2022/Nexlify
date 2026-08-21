#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();

function secret() {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    if (!line.startsWith("PANEL_INTERNAL_SECRET=")) continue;
    let v = line.slice("PANEL_INTERNAL_SECRET=".length).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return "";
}

function pulse(body) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 13000,
        path: "/api/internal/connection-pulse",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(json),
          "x-panel-internal-secret": secret(),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    req.write(json);
    req.end();
  });
}

(async () => {
  const row = await p.liveConnection.findFirst({
    where: { ip: "87.192.105.4" },
    orderBy: { lastSeenAt: "desc" },
    include: { line: { select: { username: true } }, stream: { select: { name: true } } },
  });
  if (!row) {
    console.log("no row for test ip");
    return;
  }
  const before = row.lastSeenAt;
  const code = await pulse({
    lineId: row.lineId,
    streamId: row.streamId,
    ip: row.ip,
    bytes: 120000,
  });
  const after = await p.liveConnection.findUnique({ where: { id: row.id }, select: { lastSeenAt: true } });
  console.log(
    JSON.stringify(
      {
        user: row.line?.username,
        stream: row.stream?.name,
        pulseStatus: code,
        before,
        after: after?.lastSeenAt,
        refreshed: after && +after.lastSeenAt > +before,
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
