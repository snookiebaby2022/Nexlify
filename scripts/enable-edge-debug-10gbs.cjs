#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const fs = require("fs");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const edge = fs.readFileSync(require("path").join(__dirname, "iptv-edge-proxy.mjs"), "utf8");
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    await sshExec(c, "cat > /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs", { stdin: edge });
    const r = await sshExec(
      c,
      [
        "grep -q '^IPTV_EDGE_DEBUG_UPSTREAM=' /opt/nexlify-panel/.env && sed -i 's/^IPTV_EDGE_DEBUG_UPSTREAM=.*/IPTV_EDGE_DEBUG_UPSTREAM=1/' /opt/nexlify-panel/.env || echo IPTV_EDGE_DEBUG_UPSTREAM=1 >> /opt/nexlify-panel/.env",
        "pm2 restart nexlify-iptv-edge --update-env",
        "sleep 2",
      ].join("\n")
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
