#!/usr/bin/env node
/** Test upstream by host + check stream server assignment. */
const { PrismaClient } = require("@prisma/client");
const https = require("https");
const http = require("http");

const p = new PrismaClient();

function probe(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .request(url, { method: "GET", headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" }, timeout: 12000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => {
          if (chunks.length < 2) chunks.push(c);
          if (Buffer.concat(chunks).length > 4096) res.destroy();
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, ct: res.headers["content-type"], magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 30).toString("utf8").slice(0, 30), bytes: buf.length });
        });
      })
      .on("error", (e) => resolve({ error: e.message }))
      .end();
  });
}

(async () => {
  const byServer = await p.$queryRawUnsafe(`
    SELECT COALESCE(ss.name, '(none)') AS server, COUNT(*)::int AS n
    FROM "Stream" s
    LEFT JOIN "StreamServer" ss ON ss.id = s."serverId"
    WHERE s.type = 'LIVE' AND s."isActive" = true
    GROUP BY ss.name
    ORDER BY n DESC
  `);
  console.log("byServer", JSON.stringify(byServer));

  for (const host of ["optv924.pro", "x96.pro:8880", "zee-portal.xyz", "junki3monk3y.com"]) {
    const s = await p.stream.findFirst({
      where: { type: "LIVE", isActive: true, streamUrl: { contains: host } },
      select: { name: true, streamUrl: true, serverId: true },
    });
    if (!s) continue;
    console.log("host", host, s.name, await probe(s.streamUrl.trim()));
  }
  await p.$disconnect();
})();
