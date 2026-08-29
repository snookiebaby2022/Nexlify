#!/usr/bin/env node
/** Drop reclaimable page cache on 10gbs when MemAvailable is low (streaming boxes). */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const { host, port, user, password } = await get10gbsServer(p);
  await withSshClient({ host, port, user, password }, async (c) => {
    const r = await sshExec(
      c,
      `before=$(awk '/MemAvailable/ {print $2}' /proc/meminfo);
       sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true;
       after=$(awk '/MemAvailable/ {print $2}' /proc/meminfo);
       echo "MemAvailable_kB: $before -> $after";
       free -h`
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
