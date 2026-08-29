#!/usr/bin/env node
/** Cap legacy XUI tmpfs so it cannot fill RAM again (runs on 10gbs). */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const FSTAB_LINE =
  "tmpfs /home/xui/content/streams tmpfs size=4G,mode=1777,uid=1000,gid=1000 0 0";
const CRON_LINE =
  "15 4 * * * find /home/xui/content/streams -type f -mmin +120 -delete 2>/dev/null; find /home/xui/content/streams -mindepth 1 -type d -empty -delete 2>/dev/null";

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  await withSshClient(await get10gbsServer(p), async (c) => {
    const r = await sshExec(
      c,
      `
set -euo pipefail
if grep -q '/home/xui/content/streams' /etc/fstab 2>/dev/null; then
  sed -i 's|^tmpfs.*/home/xui/content/streams.*|${FSTAB_LINE}|' /etc/fstab
else
  echo '${FSTAB_LINE}' >> /etc/fstab
fi
(crontab -l 2>/dev/null | grep -v 'xui/content/streams'; echo '${CRON_LINE}') | crontab -
mount -o remount,size=4G /home/xui/content/streams 2>/dev/null || true
df -h /home/xui/content/streams 2>/dev/null || true
echo 'fstab:'
grep xui/content/streams /etc/fstab || true
echo 'cron:'
crontab -l | grep xui || true
`
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
