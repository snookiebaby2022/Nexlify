#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { decryptAtRest, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");

async function sshAll(prisma, name, cmd) {
  const s = await prisma.streamServer.findFirst({ where: { name } });
  if (!s?.agentSshPasswordEnc) throw new Error(`no ssh for ${name}`);
  const password = decryptAtRest(s.agentSshPasswordEnc);
  await withSshClient(
    {
      host: s.agentSshHost || s.host,
      port: s.agentSshPort || 22,
      username: s.agentSshUser || "root",
      password,
    },
    async (c) => {
      const r = await sshExec(c, cmd, { timeoutMs: 25000 });
      console.log(`\n===== ${name} =====`);
      console.log((r.stdout || r.stderr || "").trim());
    }
  );
}

(async () => {
  const prisma = new PrismaClient();
  await sshAll(
    prisma,
    "10gbs",
    `set +e; echo '--- unit ---'; cat /etc/systemd/system/pm2-root.service; echo '--- wants ---'; ls -l /etc/systemd/system/multi-user.target.wants/pm2-root.service; echo '--- show ---'; systemctl show pm2-root -p UnitFileState,WantedBy,ActiveState,SubState,ConditionResult,Result`
  );
  await sshAll(
    prisma,
    "back up",
    `set +e; echo HOST=$(hostname); echo UPTIME=$(uptime -p); ss -lntp | grep -E ':80 |:443 |:8080 |:25461 |:22 '; echo '--- 80 ---'; curl -sS -m 4 -D - -o /tmp/b.bin http://127.0.0.1/ | head -20; echo BYTES=$(wc -c </tmp/b.bin); echo '--- units ---'; systemctl list-unit-files | grep -Ei 'nginx|pm2|nexlify|xui' | head; ls /home/xui /opt/nexlify-panel /opt/nexlify-agent 2>/dev/null; echo '--- xui ---'; crontab -l 2>/dev/null | head`
  );
  console.log("\n===== from panel curl =====");
  for (const u of [
    "http://5.231.123.38/",
    "http://5.231.123.38/player_api.php",
    "http://209.237.141.15/",
    "http://209.237.141.15:8080/player_api.php",
  ]) {
    try {
      console.log(
        execSync(`curl -sS -m 6 -D - -o /tmp/curlbody -w 'URL ${u} code=%{http_code} bytes=%{size_download}\\n' '${u}' | head -18`, {
          encoding: "utf8",
        })
      );
    } catch (e) {
      console.log(u, e.message);
    }
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
