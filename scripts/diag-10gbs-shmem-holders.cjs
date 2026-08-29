#!/usr/bin/env node
/** Find processes holding shared memory (Shmem) on 10gbs. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const PROBE = `
echo '=== mem pressure ==='
awk '/MemTotal|MemAvailable|Cached|Shmem|AnonPages|SwapTotal|SwapFree/ {print}' /proc/meminfo
vmstat 1 2 | tail -1
echo '=== top Shmem by process (RSS + shared) ==='
ps -eo pid,user,rss,vsz,comm --sort=-rss | head -15
echo '=== smaps Shmem rollup (top 10) ==='
for f in /proc/[0-9]*/smaps_rollup; do
  pid=$(basename $(dirname $f))
  sh=$(awk '/RssShmem:/ {s+=$2} END {print s+0}' $f 2>/dev/null)
  [ "$sh" -gt 1024 ] 2>/dev/null || continue
  cmd=$(tr -d '\\0' < /proc/$pid/comm 2>/dev/null || echo ?)
  echo "$sh $pid $cmd"
done 2>/dev/null | sort -nr | head -10
echo '=== tmpfs mounts ==='
findmnt -t tmpfs -o TARGET,SIZE,USED,AVAIL 2>/dev/null || df -h -t tmpfs
echo '=== recent OOM ==='
dmesg -T 2>/dev/null | grep -iE 'oom|out of memory|killed process' | tail -8 || true
echo '=== slab top ==='
grep -E '^slabinfo|^# name' /proc/slabinfo 2>/dev/null | head -1
awk '{print $2*$4, $1}' /proc/slabinfo 2>/dev/null | sort -nr | head -8
`;

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  await withSshClient(await get10gbsServer(p), async (c) => {
    const r = await sshExec(c, PROBE, { timeoutMs: 60_000 });
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
