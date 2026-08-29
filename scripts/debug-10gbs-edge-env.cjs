#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const fs = require("fs");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  const edge = fs.readFileSync(require("path").join(__dirname, "iptv-edge-proxy.mjs"), "utf8");
  const hasFix = edge.includes("effectiveOutboundProxy");
  console.log("local edge has fix:", hasFix);

  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      [
        "grep IPTV_EDGE_REMOTE /opt/nexlify-panel/.env",
        "grep -c effectiveOutboundProxy /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs || true",
        "pm2 env 0 2>/dev/null | grep IPTV_EDGE_REMOTE || true",
        "curl -s -m 8 -x http://127.0.0.1:8888 -A VLC -o /dev/null -w 'via_proxy=%{http_code} bytes=%{size_download}\\n' 'https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5' || true",
        "node /tmp/probe-upstream.cjs 2>/dev/null || node -e \"console.log('no probe')\"",
      ].join("\n")
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch(console.error);
