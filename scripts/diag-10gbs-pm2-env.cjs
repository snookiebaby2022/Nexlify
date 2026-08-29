#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const { host, port, user, password } = await get10gbsServer(p);
  await withSshClient({ host, port, user, password }, async (c) => {
    const r = await sshExec(
      c,
      "pm2 env 0 2>/dev/null | egrep 'IPTV_EDGE_DEBUG|IPTV_EDGE_AGENT|IPTV_EDGE_REMOTE|PANEL_INTERNAL' ; echo '---'; grep IPTV_EDGE_DEBUG /opt/nexlify-panel/.env"
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
