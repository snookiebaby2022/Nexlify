#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { decryptAtRest, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const p = new PrismaClient();

(async () => {
  const s = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  await withSshClient(
    {
      host: s.agentSshHost || s.host,
      port: s.agentSshPort || 22,
      username: s.agentSshUser || "root",
      password: decryptAtRest(s.agentSshPasswordEnc),
    },
    async (c) => {
      const r = await sshExec(
        c,
        "pm2 list | sed -n 1,16p; echo ===== LISTEN =====; ss -lntp | awk '/:8080 |:25461 /{print}'; echo ===== LOG =====; ls -t /root/.pm2/logs/*edge* 2>/dev/null | head -4; echo ---out---; tail -n 40 /root/.pm2/logs/nexlify-iptv-edge-out.log 2>/dev/null; echo ---err---; tail -n 40 /root/.pm2/logs/nexlify-iptv-edge-error.log 2>/dev/null",
        { timeoutMs: 25000 }
      );
      console.log((r.stdout || "") + (r.stderr || ""));
    }
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
