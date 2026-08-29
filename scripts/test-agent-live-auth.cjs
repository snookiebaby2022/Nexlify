#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const uri = `/live/${creds.u}/${encodeURIComponent(creds.p)}/1476023810.ts`;
  const secret = process.env.PANEL_INTERNAL_SECRET || process.env.PANEL_API_SECRET || "";

  const agentAuth = await new Promise((resolve) => {
    const t0 = Date.now();
    http
      .request(
        {
          hostname: "127.0.0.1",
          port: 13000,
          path: "/api/internal/live-auth",
          method: "GET",
          headers: {
            authorization: `Bearer ${server.agentToken}`,
            "x-nexlify-agent-server-id": server.id,
            "x-original-uri": uri,
            "x-original-method": "GET",
            "x-forwarded-for": "127.0.0.1",
            "user-agent": "VLC/3.0.20 LibVLC/3.0.20",
          },
          timeout: 15000,
        },
        (res) => {
          resolve({
            ms: Date.now() - t0,
            status: res.statusCode,
            upstream: res.headers["x-nexlify-upstream"] || "",
            passthrough: res.headers["x-nexlify-passthrough"] || "",
          });
          res.resume();
        }
      )
      .on("error", (e) => resolve({ error: e.message }))
      .end();
  });

  console.log(JSON.stringify({ uri, agentAuth }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
