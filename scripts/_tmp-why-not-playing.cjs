#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function get(url, headers = {}, ms = 15000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: ms, headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => {
        chunks.push(c);
        if (Buffer.concat(chunks).length > 65536) req.destroy();
      });
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          bytes: buf.length,
          ct: res.headers["content-type"] || "",
          loc: res.headers["location"] || "",
          body: buf.slice(0, 200).toString("utf8"),
          magic: buf.slice(0, 4).toString("hex"),
          mpegts: buf[0] === 0x47,
        });
      });
    });
    req.on("error", (e) => resolve({ error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
  });
}

function liveAuth(uri, extra = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 13000,
        path: "/api/internal/live-auth",
        method: "GET",
        timeout: 10000,
        headers: {
          "x-panel-internal-secret": process.env.PANEL_INTERNAL_SECRET || "",
          "x-original-uri": uri,
          "x-original-method": "GET",
          "x-forwarded-for": "127.0.0.1",
          "user-agent": "VLC/3.0.20 LibVLC/3.0.20",
          ...extra,
        },
      },
      (res) => {
        resolve({
          status: res.statusCode,
          upstream: res.headers["x-nexlify-upstream"] || "",
          live: res.headers["x-nexlify-live"] || "",
          err: res.headers["x-nexlify-error"] || "",
          streamId: res.headers["x-nexlify-stream-id"] || "",
        });
        res.resume();
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.end();
  });
}

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const stream = await p.stream.findFirst({
    where: { type: "LIVE", isActive: true, xtreamNum: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, xtreamNum: true, vodMode: true, isOnDemand: true, streamUrl: true },
  });
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  const liveNow = await p.liveConnection.count({
    where: { lastSeenAt: { gt: new Date(Date.now() - 45_000) } },
  });
  const uri = `/live/${creds.u}/${creds.p}/${stream.xtreamNum}.ts`;
  const agentHeaders = {
    authorization: `Bearer ${server.agentToken}`,
    "x-nexlify-agent-server-id": server.id,
  };
  const authLocal = await liveAuth(uri);
  const authAgent = await liveAuth(uri, agentHeaders);
  const play45 = await get(`http://127.0.0.1:8080${uri}`);
  const play10 = await get(`http://209.237.141.15:8080${uri}`);
  const play80 = await get(`http://127.0.0.1${uri}`);
  console.log(
    JSON.stringify(
      {
        creds: creds.u,
        stream,
        liveNow,
        uri,
        authLocal,
        authAgent,
        play45,
        play80,
        play10,
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
