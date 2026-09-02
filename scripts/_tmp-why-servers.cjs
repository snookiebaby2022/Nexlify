#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function liveAuth(uri, extra = {}) {
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
          ...extra,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: body.slice(0, 80),
            upstream: String(res.headers["x-nexlify-upstream"] || "").slice(0, 80),
            live: res.headers["x-nexlify-live"] || "",
            sid: res.headers["x-nexlify-stream-id"] || "",
          })
        );
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
  const servers = await p.streamServer.findMany({
    select: { id: true, name: true, host: true, port: true },
  });
  const counts = [];
  for (const s of servers) {
    counts.push({
      name: s.name,
      host: s.host,
      port: s.port,
      live: await p.stream.count({ where: { type: "LIVE", isActive: true, serverId: s.id } }),
      movie: await p.stream.count({ where: { type: "MOVIE", isActive: true, serverId: s.id } }),
    });
  }
  const ten = servers.find((s) => s.name === "10gbs");
  const fullTen = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  const agentHeaders = {
    authorization: `Bearer ${fullTen.agentToken}`,
    "x-nexlify-agent-server-id": fullTen.id,
  };
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const ndtv = `/live/${creds.u}/${creds.p}/108101847.ts`;
  const sky = `/live/Joemc9999/44449999/1737131161.ts`;
  console.log(
    JSON.stringify(
      {
        counts,
        ndtvLocal: await liveAuth(ndtv),
        ndtvAgent: await liveAuth(ndtv, agentHeaders),
        skyLocal: await liveAuth(sky),
        skyAgent: await liveAuth(sky, agentHeaders),
      },
      null,
      2
    )
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
