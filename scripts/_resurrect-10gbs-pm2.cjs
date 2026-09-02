#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const { execSync } = require("child_process");

const CMD = `
set +e
echo '=== pm2-root unit ==='
systemctl status pm2-root --no-pager -l | head -40
echo '=== start/resurrect ==='
systemctl start pm2-root
sleep 2
systemctl is-active pm2-root
pm2 resurrect
sleep 3
pm2 status
echo '=== listen ==='
ss -lntp | grep -E ':8080|:25461' || echo 'NO_8080'
curl -sS -m 4 -o /dev/null -w 'local8080:%{http_code}\\n' http://127.0.0.1:8080/player_api.php || true
echo '=== dump resurrect logs ==='
journalctl -u pm2-root --no-pager -n 30
`.trim();

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(c, CMD, { timeoutMs: 45000 });
    console.log(r.stdout || r.stderr);
  });
  console.log("--- panel -> 10gbs:8080 ---");
  try {
    console.log(
      execSync(
        "curl -sS -m 8 -o /dev/null -w 'reach:%{http_code} t=%{time_total} err=%{errormsg}\\n' http://209.237.141.15:8080/player_api.php || true",
        { encoding: "utf8" }
      )
    );
  } catch (e) {
    console.log(String(e.stdout || e.message));
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
