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
      `ss -lntp | grep 8080; echo '---'; grep -c 'never forward live' /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs; grep -c 'forward(clientReq, clientRes, { listenPort, proto });' /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs; echo '---'; pm2 describe nexlify-iptv-edge 2>/dev/null | head -25`
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
