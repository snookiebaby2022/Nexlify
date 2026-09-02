#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function liveAuth(uri) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 13000,
        path: "/api/internal/live-auth",
        method: "GET",
        timeout: 8000,
        headers: {
          "x-panel-internal-secret": process.env.PANEL_INTERNAL_SECRET || "",
          "x-original-uri": uri,
          "x-original-method": "GET",
          "x-forwarded-for": "127.0.0.1",
          "user-agent": "VLC/3.0.20 LibVLC/3.0.20",
        },
      },
      (res) => {
        resolve({
          status: res.statusCode,
          upstream: String(res.headers["x-nexlify-upstream"] || "").slice(0, 100),
          live: res.headers["x-nexlify-live"] || "",
          sid: res.headers["x-nexlify-stream-id"] || "",
        });
        res.resume();
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
    req.on("error", (e) => resolve({ error: e.message }));
    req.end();
  });
}

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const line = await p.line.findUnique({ where: { username: creds.u }, select: { id: true } });
  const bouquets = await p.lineBouquet.findMany({ where: { lineId: line.id }, select: { bouquetId: true }, take: 3 });
  const ids = bouquets.map((b) => b.bouquetId);
  const bs = ids.length
    ? await p.bouquetStream.findFirst({
        where: { bouquetId: { in: ids }, stream: { type: "LIVE", isActive: true, xtreamNum: { not: null } } },
        select: { stream: { select: { name: true, xtreamNum: true, serverId: true } } },
      })
    : null;
  const stream = bs?.stream;
  if (!stream) {
    console.log(JSON.stringify({ error: "no live stream on smoke bouquets", bouquetCount: ids.length }));
    await p.$disconnect();
    return;
  }
  const uri = `/live/${creds.u}/${creds.p}/${stream.xtreamNum}.ts`;
  const auth = await liveAuth(uri);
  const ten = await p.streamServer.findFirst({ where: { name: "10gbs" }, select: { id: true } });
  console.log(
    JSON.stringify({
      name: stream.name,
      xtreamNum: stream.xtreamNum,
      on10gbs: stream.serverId === ten.id,
      serverId: stream.serverId,
      auth,
    })
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
