#!/usr/bin/env node
/** chattr +i / -i the 10gbs copy of iptv-edge-proxy.mjs */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const mode = process.argv[2] === "unlock" ? "-i" : "+i";
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `chattr ${mode} /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs 2>/dev/null; lsattr /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs`
    );
    console.log(r.stdout || r.stderr);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
