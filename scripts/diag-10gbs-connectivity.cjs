#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    for (const cmd of [
      "ss -tlnp | grep 8080 || true",
      "free -h; uptime",
      "curl -sS -m 5 -o /dev/null -w 'panel8080:%{http_code} t=%{time_total}s\\n' http://45.88.138.18:8080/player_api.php || true",
      "pm2 jlist 2>/dev/null | node -pe \"JSON.parse(require('fs').readFileSync(0,'utf8')).filter(x=>x.name.includes('iptv')).map(x=>({name:x.name,mem:Math.round((x.monit?.memory||0)/1048576)+'mb',cpu:x.monit?.cpu}))\" || pm2 list | head -8",
    ]) {
      console.log("---", cmd, "---");
      const r = await sshExec(c, cmd);
      console.log(r.stdout || r.stderr || "");
    }
  });
  // From panel host to 10gbs public IP
  const { execSync } = require("child_process");
  console.log("--- panel -> 10gbs:8080 ---");
  try {
    console.log(
      execSync(
        "curl -sS -m 8 -o /dev/null -w 'panel_to_10gbs:%{http_code} t=%{time_total}s connect=%{time_connect}s\\n' http://209.237.141.15:8080/ || true",
        { encoding: "utf8" }
      )
    );
  } catch (e) {
    console.log(e.message);
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
