#!/usr/bin/env node
/** XUI stack diagnostic: panel nginx → 10gbs edge → upstream. */
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const p = new PrismaClient();

function get(url, headers = {}) {
  return new Promise((resolve) => {
    http
      .get(url, { timeout: 20000, headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => {
          chunks.push(c);
          if (Buffer.concat(chunks).length > 16384) res.destroy();
        });
        res.on("close", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, bytes: buf.length, magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 30).toString("utf8") });
        });
      })
      .on("error", (e) => resolve({ error: e.message }));
  });
}

(async () => {
  const secret =
    process.env.PANEL_INTERNAL_SECRET || process.env.PANEL_API_SECRET || "";
  const credsLine = require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
    encoding: "utf8",
  }).trim();
  const { u: U, p: P } = JSON.parse(credsLine);
  const sid = 1476023810;
  const uri = `/live/${U}/${P}/${sid}.ts`;

  const [remote8080, panel8080] = await Promise.all([
    get(`http://209.237.141.15:8080${uri}`, { "User-Agent": "VLC/3.0.20", Range: "bytes=0-" }),
    get(`http://127.0.0.1:8080${uri}`, { "User-Agent": "VLC/3.0.20", Range: "bytes=0-" }),
  ]);

  const ssh = await get10gbsServer(p);
  let remoteDiag = "";
  await withSshClient({ host: ssh.host, port: ssh.port, username: ssh.user, password: ssh.password }, async (c) => {
    const r = await sshExec(
      c,
      [
        "ss -tlnp | grep 8080 || echo NO_8080",
        "pm2 list 2>/dev/null | head -6",
        "curl -s -m 8 -o /dev/null -w 'panel_health=%{http_code}\\n' http://45.88.138.18:13000/api/health || echo panel_health=fail",
        `curl -s -m 15 -D - -o /dev/null -H 'x-panel-internal-secret: ${secret.replace(/'/g, "'\\''")}' -H 'x-original-uri: ${uri}' -H 'x-original-method: GET' http://45.88.138.18:13000/api/internal/live-auth | tr -d '\\r' | head -8`,
        "curl -s -m 15 -A 'VLC/3.0.20' -o /tmp/u.bin -w 'prov=%{http_code} bytes=%{size_download}\\n' 'https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5'",
        "head -c 4 /tmp/u.bin | xxd | head -1 || true",
      ].join("\n")
    );
    remoteDiag = r.stdout + r.stderr;
  });

  console.log(JSON.stringify({ uri, panel8080, remote8080, remoteDiag }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
