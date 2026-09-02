#!/usr/bin/env node
"use strict";
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("/opt/nexlify-panel/scripts/ssh-10gbs-lib.cjs");
const p = new PrismaClient();
(async () => {
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      "pm2 jlist | python3 -c 'import json,sys; d=json.load(sys.stdin);\n[print(x.get(\"name\"), x.get(\"pm2_env\",{}).get(\"status\"), x.get(\"pid\")) for x in d if \"edge\" in str(x.get(\"name\"))]'; grep -n 'Never pause the origin' /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs | head -1; pm2 logs nexlify-iptv-edge --lines 30 --nostream"
    );
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
  });
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
