#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const CMD = `
set +e
export PATH="/usr/local/bin:/usr/bin:/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"
echo PATH=$PATH
echo WHICH_NODE=$(command -v node)
echo WHICH_PM2=$(command -v pm2)
echo WHICH_NGINX=$(command -v nginx)
echo NODE_VER=$(node -v 2>/dev/null)
ls -la /usr/bin/pm2 /usr/local/bin/pm2 /root/.nvm 2>/dev/null | head
echo '--- units ---'
systemctl list-unit-files | grep -Ei 'nginx|pm2|nexlify|edge' || true
echo '--- listen ---'
ss -lntp | head -40
echo '--- 80/443 owners ---'
ss -lntp | grep -E ':80 |:443 '
echo '--- crontab ---'
crontab -l 2>/dev/null | head -20
echo '--- rc.local ---'
cat /etc/rc.local 2>/dev/null | head -20
echo '--- edge files ---'
ls -l /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs /opt/nexlify-panel/ecosystem.config.cjs 2>/dev/null
ls /opt/nexlify-panel/.env 2>/dev/null && grep -E 'IPTV_EDGE|STREAM_HTTP|NEXLIFY_USE' /opt/nexlify-panel/.env | sed 's/SECRET=.*/SECRET=***/'
echo '--- journal ---'
journalctl -u nexlify-iptv-edge --no-pager -n 15 2>/dev/null || true
echo '--- pm2 dump ---'
ls -l /root/.pm2/dump.pm2 /root/.pm2/dump.pm2.bak 2>/dev/null
python3 - <<'PY'
import json,os
p='/root/.pm2/dump.pm2'
if os.path.isfile(p):
  data=json.load(open(p))
  apps=data if isinstance(data,list) else data.get('apps') or data
  if isinstance(apps, dict):
    apps=list(apps.values()) if apps else []
  print('dump_apps', len(apps) if isinstance(apps,list) else type(apps))
  if isinstance(apps,list):
    for a in apps[:20]:
      if isinstance(a, dict):
        print(' ', a.get('name'), a.get('pm_exec_path') or a.get('script'), a.get('status'))
PY
`.trim();

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(c, CMD, { timeoutMs: 30000 });
    console.log(r.stdout || r.stderr);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
