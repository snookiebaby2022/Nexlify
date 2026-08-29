#!/usr/bin/env node
/** Detailed RAM breakdown on 10gbs stream server. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const PROBE = `
grep -E '^(MemTotal|MemFree|MemAvailable|Cached|Shmem|AnonPages|Slab|SReclaimable|SwapTotal|SwapFree):' /proc/meminfo
echo '---'
free -h
echo '---'
ps aux --sort=-%mem | head -12
echo '---'
df -h /dev/shm 2>/dev/null || true
`;

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const creds = await get10gbsServer(p);
  await withSshClient(creds, async (c) => {
    const r = await sshExec(c, PROBE);
    console.log(r.stdout);
    const kv = {};
    for (const line of r.stdout.split("\n")) {
      const m = line.match(/^(\w+):\s+(\d+)/);
      if (m) kv[m[1]] = Number(m[2]);
    }
    const total = kv.MemTotal || 1;
    const legacy = Math.round(((total - (kv.MemAvailable || 0)) / total) * 100);
    const processPct = Math.round((((kv.AnonPages || 0) + (kv.Shmem || 0)) / total) * 100);
    const cachePct = Math.round(((kv.Cached || 0) / total) * 100);
    console.log("---");
    console.log(`legacy_pct=${legacy} process_pct=${processPct} cache_pct=${cachePct}`);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
