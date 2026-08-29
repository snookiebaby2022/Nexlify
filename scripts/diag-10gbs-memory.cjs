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
      "free -h; echo '---'; uptime; echo '---'; pm2 status; echo '---'; ps aux --sort=-%mem | head -15; echo '---'; cat /proc/meminfo | egrep 'MemTotal|MemFree|MemAvailable|Cached|SReclaimable'"
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
