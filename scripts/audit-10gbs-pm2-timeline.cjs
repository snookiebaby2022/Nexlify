#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const cmds = [
      "date -u; uptime",
      "grep '2026-09-15' /root/.pm2/pm2.log | grep -E 'nexlify-iptv-edge|Stopping|Starting' | tail -50",
      "pm2 describe nexlify-iptv-edge 2>/dev/null | grep -E 'status|restarts|uptime|created'",
      "tail -30 /root/.bash_history 2>/dev/null || true",
    ];
    for (const cmd of cmds) {
      console.log("\n===", cmd.slice(0, 72), "===");
      const r = await sshExec(c, cmd, { timeoutMs: 45_000 });
      console.log(r.stdout || r.stderr || "(empty)");
    }
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
