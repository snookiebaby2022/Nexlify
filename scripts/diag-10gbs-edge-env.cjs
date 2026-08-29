#!/usr/bin/env node
/** Print 10gbs edge PM2 env + verify edge script has edgeCanAuthLive. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `grep -c edgeCanAuthLive /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs; pm2 env 0 2>/dev/null | egrep 'IPTV_EDGE_AGENT|IPTV_EDGE_SERVER|PANEL_INTERNAL|IPTV_EDGE_REMOTE|IPTV_EDGE_BACKEND' | head -20`
    );
    console.log(r.stdout || r.stderr);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
