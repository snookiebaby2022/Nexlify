#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const { execSync } = require("child_process");

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    console.log("--- 10gbs listen/pm2 ---");
    let r = await sshExec(
      c,
      `ss -tlnp | grep 8080 || true; pm2 describe nexlify-iptv-edge 2>/dev/null | head -20; ls -l /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs`
    );
    console.log(r.stdout || r.stderr);
    r = await sshExec(
      c,
      `cd /opt/nexlify-panel && pm2 start ecosystem.config.cjs --only nexlify-iptv-edge --update-env 2>/dev/null; pm2 restart nexlify-iptv-edge --update-env; sleep 4; ss -tlnp | grep 8080; curl -sS -m 3 -o /dev/null -w 'local8080:%{http_code}\\n' http://127.0.0.1:8080/player_api.php || true; pm2 logs nexlify-iptv-edge --lines 15 --nostream`
    );
    console.log(r.stdout || r.stderr);
  });
  console.log("--- panel -> 10gbs:8080 ---");
  try {
    console.log(
      execSync(
        "curl -sS -m 8 -o /dev/null -w 'reach:%{http_code} t=%{time_total}s err=%{errormsg}\\n' http://209.237.141.15:8080/ || true",
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
