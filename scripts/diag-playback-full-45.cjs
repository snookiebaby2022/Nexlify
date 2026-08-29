#!/usr/bin/env node
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
require("./load-env.cjs").loadEnv();

const p = new PrismaClient();

function fetch(url, headers = {}) {
  return new Promise((resolve) => {
    http
      .get(url, { timeout: 30000, headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => {
          chunks.push(c);
          if (Buffer.concat(chunks).length > 65536) res.destroy();
        });
        res.on("close", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            bytes: buf.length,
            magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 40).toString("utf8"),
            ct: res.headers["content-type"],
          });
        });
      })
      .on("error", (e) => resolve({ error: e.message }));
  });
}

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const uri = `/live/${creds.u}/${creds.p}/1476023810.ts`;
  const secret = process.env.PANEL_INTERNAL_SECRET || process.env.PANEL_API_SECRET || "";

  const server = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  const agentHeaders = {
    authorization: `Bearer ${server.agentToken}`,
    "x-nexlify-agent-server-id": server.id,
    "x-original-uri": uri,
    "x-original-method": "GET",
    "x-forwarded-for": "127.0.0.1",
    "user-agent": "VLC/3.0.20 LibVLC/3.0.20",
  };

  const auth = await new Promise((resolve) => {
    http
      .request(
        {
          hostname: "127.0.0.1",
          port: 13000,
          path: "/api/internal/live-auth",
          method: "GET",
          headers: { ...agentHeaders, "x-panel-internal-secret": secret },
        },
        (res) => {
          resolve({
            status: res.statusCode,
            upstream: res.headers["x-nexlify-upstream"] || "",
            proxy: res.headers["x-nexlify-outbound-proxy"] || "",
            live: res.headers["x-nexlify-live"] || "",
          });
          res.resume();
        }
      )
      .on("error", (e) => resolve({ error: e.message }))
      .end();
  });

  const play45 = await fetch(`http://127.0.0.1:8080${uri}`, { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" });
  const play10 = await fetch(`http://209.237.141.15:8080${uri}`, { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" });

  let remote = "";
  const ssh = await get10gbsServer(p);
  await withSshClient({ host: ssh.host, port: ssh.port, username: ssh.user, password: ssh.password }, async (c) => {
    const r = await sshExec(c, "cd /opt/nexlify-panel && node scripts/test-provider-redirects.cjs");
    remote = r.stdout;
  });

  console.log(JSON.stringify({ uri, auth, play45, play10, providerTests: remote.split("\n").slice(0, 8) }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
