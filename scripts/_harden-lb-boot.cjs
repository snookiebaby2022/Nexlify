#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { decryptAtRest, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const { PrismaClient } = require("@prisma/client");

async function sshNamed(prisma, name, cmd, timeoutMs = 30000) {
  const s = await prisma.streamServer.findFirst({ where: { name } });
  if (!s?.agentSshPasswordEnc) throw new Error(`no ssh for ${name}`);
  await withSshClient(
    {
      host: s.agentSshHost || s.host,
      port: s.agentSshPort || 22,
      username: s.agentSshUser || "root",
      password: decryptAtRest(s.agentSshPasswordEnc),
    },
    async (c) => {
      const r = await sshExec(c, cmd, { timeoutMs });
      console.log(`\n===== ${name} =====\n${(r.stdout || r.stderr || "").trim()}`);
      return r;
    }
  );
}

const HARDEN_PM2 = `
set -e
cat > /etc/systemd/system/pm2-root.service <<'EOF'
[Unit]
Description=PM2 process manager
Documentation=https://pm2.keymetrics.io/
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=root
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=PM2_HOME=/root/.pm2
PIDFile=/root/.pm2/pm2.pid
Restart=on-failure
RestartSec=5
ExecStartPre=/bin/rm -f /root/.pm2/pm2.pid
ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect
ExecReload=/usr/lib/node_modules/pm2/bin/pm2 reload all
ExecStop=/usr/lib/node_modules/pm2/bin/pm2 kill

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable pm2-root
systemctl restart pm2-root
sleep 2
systemctl is-enabled pm2-root
systemctl is-active pm2-root
pm2 save
pm2 status
ss -lntp | grep -E ':8080|:25461' || true
`.trim();

const BACKUP_INSPECT = `
set +e
echo '--- ufw ---'
ufw status 2>/dev/null | head -20
echo '--- xuione ---'
systemctl is-enabled xuione; systemctl is-active xuione
systemctl status xuione --no-pager | head -20
echo '--- listen all ---'
ss -lntp | grep -vE '127.0.0.53' | head -40
echo '--- iptables 8080 ---'
iptables -L INPUT -n | head -30
`.trim();

(async () => {
  const prisma = new PrismaClient();
  await sshNamed(prisma, "10gbs", HARDEN_PM2, 40000);
  await sshNamed(prisma, "back up", BACKUP_INSPECT, 25000);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
