#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
console.error("start");
function liveAuth(uri) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 13000,
        path: "/api/internal/live-auth",
        method: "GET",
        timeout: 12000,
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
          upstream: String(res.headers["x-nexlify-upstream"] || "").slice(0, 90),
          live: res.headers["x-nexlify-live"] || "",
          sid: res.headers["x-nexlify-stream-id"] || "",
        });
        res.resume();
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.end();
  });
}
function play(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 15000, headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => {
        chunks.push(c);
        if (Buffer.concat(chunks).length > 4096) req.destroy();
      });
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, bytes: buf.length, body: buf.slice(0, 60).toString("utf8"), mpegts: buf[0] === 0x47 });
      });
    });
    req.on("error", (e) => resolve({ error: e.message }));
  });
}
(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  console.error("creds", creds.u);
  const line = await p.line.findUnique({
    where: { username: creds.u },
    select: { id: true },
  });
  const row = await p.$queryRaw`
    SELECT s.id, s.name, s."xtreamNum"
    FROM "LineBouquet" lb
    INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
    INNER JOIN "Stream" s ON s.id = bs."streamId"
    WHERE lb."lineId" = ${line.id}
      AND s.type = 'LIVE'
      AND s."isActive" = true
      AND s."xtreamNum" IS NOT NULL
    LIMIT 1
  `;
  console.error("row", row);
  const stream = row[0];
  const uri = `/live/${creds.u}/${creds.p}/${stream.xtreamNum}.ts`;
  const auth = await liveAuth(uri);
  console.error("auth", auth);
  const p10 = await play(`http://209.237.141.15:8080${uri}`);
  console.error("play10", p10);
  const p45 = await play(`http://127.0.0.1:8080${uri}`);
  console.error("play45", p45);
  const recent = await p.liveConnection.findFirst({
    orderBy: { lastSeenAt: "desc" },
    include: { stream: { select: { xtreamNum: true, name: true, serverId: true } }, line: { select: { username: true, password: true } } },
  });
  if (recent?.line && recent.stream?.xtreamNum) {
    const ruri = `/live/${recent.line.username}/${recent.line.password}/${recent.stream.xtreamNum}.ts`;
    const rauth = await liveAuth(ruri);
    const rplay = await play(`http://209.237.141.15:8080${ruri}`);
    console.error("real", {
      user: recent.line.username,
      name: recent.stream.name,
      auth: rauth,
      play: rplay,
    });
  }
  await p.$disconnect();
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
