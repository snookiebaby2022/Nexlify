#!/usr/bin/env node
/**
 * Install nightly page-cache drop on 10gbs (04:30 UTC) + run once now.
 * Safe during low traffic — only drops reclaimable cache, not process RAM.
 */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const REMOTE_SCRIPT = `#!/bin/bash
set -euo pipefail
LOG=/var/log/nexlify-drop-cache.log
before=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
after=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
echo "$(date -Is) MemAvailable_kB: $before -> $after" >> "$LOG"
# Keep log small
tail -n 200 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
`;

const CRON_LINE = "30 4 * * * /usr/local/bin/nexlify-drop-page-cache.sh >> /var/log/nexlify-drop-cache.log 2>&1";

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const creds = await get10gbsServer(p);
  await withSshClient(creds, async (c) => {
    const b64 = Buffer.from(REMOTE_SCRIPT, "utf8").toString("base64");
    await sshExec(
      c,
      `echo '${b64}' | base64 -d > /usr/local/bin/nexlify-drop-page-cache.sh && chmod +x /usr/local/bin/nexlify-drop-page-cache.sh`
    );
    await sshExec(
      c,
      `(crontab -l 2>/dev/null | grep -v nexlify-drop-page-cache; echo '${CRON_LINE}') | crontab -`
    );
    console.log("[10gbs] cron installed:", CRON_LINE);
    const run = await sshExec(c, "/usr/local/bin/nexlify-drop-page-cache.sh && tail -3 /var/log/nexlify-drop-cache.log; free -h");
    console.log(run.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
