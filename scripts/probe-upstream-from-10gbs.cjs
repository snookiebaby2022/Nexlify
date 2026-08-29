#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const probe = require("fs").readFileSync(require("path").join(__dirname, "probe-upstream-direct.cjs"), "utf8");

(async () => {
  const p = require("@prisma/client").PrismaClient;
  const prisma = new p();
  const s = await get10gbsServer(prisma);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    await sshExec(c, "cat > /tmp/probe-upstream.cjs", { stdin: probe });
    const r = await sshExec(c, "grep IPTV_EDGE_REMOTE /opt/nexlify-panel/.env; node /tmp/probe-upstream.cjs");
    console.log(r.stdout);
  });
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
