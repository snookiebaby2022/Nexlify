#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const PROBE = `
echo '=== ipcs -m (top 15 by size) ==='
ipcs -m 2>/dev/null | awk 'NR==1 || NR==2 || $5>0' | sort -k5 -nr | head -16
echo '=== /dev/shm ==='
ls -lah /dev/shm 2>/dev/null | head -20
du -sh /dev/shm/* 2>/dev/null | sort -hr | head -10
echo '=== hugetlb ==='
grep -i huge /proc/meminfo 2>/dev/null | head -5
echo '=== xui procs ==='
pgrep -a xui 2>/dev/null | head -5; pgrep -af LLOD 2>/dev/null | head -5
`;

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  await withSshClient(await get10gbsServer(p), async (c) => {
    const r = await sshExec(c, PROBE);
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
