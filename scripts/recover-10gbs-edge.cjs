#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const fs = require("fs");
const path = require("path");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
const { execSync } = require("child_process");

async function pushScript(c, name) {
  const local = path.join(__dirname, name);
  if (!fs.existsSync(local)) return;
  const body = fs.readFileSync(local);
  const remote = `/opt/nexlify-panel/scripts/${name}`;
  const w = await sshExec(c, `cat > ${remote} && chmod +x ${remote}`, { stdin: body, timeoutMs: 60_000 });
  if (w.code !== 0) throw new Error(`push ${name}: ${w.stderr || w.stdout}`);
}

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    for (const sh of [
      "lb-edge-remote-recover.sh",
      "ensure-iptv-edge-pm2.sh",
      "install-iptv-edge-boot.sh",
      "fix-edge-ports-remote.sh",
      "iptv-edge-proxy.mjs",
      "edge-redis-slots.mjs",
      "edge-redis-auth.mjs",
    ]) {
      try {
        await pushScript(c, sh);
        console.log(`pushed ${sh} to 10gbs`);
      } catch (e) {
        console.warn(String(e.message || e));
      }
    }
    console.log("--- 10gbs listen/pm2 ---");
    let r = await sshExec(
      c,
      `ss -tlnp | grep 8080 || true; pm2 describe nexlify-iptv-edge 2>/dev/null | head -20; ls -l /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs`
    );
    console.log(r.stdout || r.stderr);
    r = await sshExec(
      c,
      `bash /opt/nexlify-panel/scripts/lb-edge-remote-recover.sh 2>/dev/null || bash /opt/nexlify-panel/scripts/ensure-iptv-edge-pm2.sh; sleep 4; ss -tlnp | grep 8080; curl -sS -m 3 -o /dev/null -w 'local8080:%{http_code}\\n' http://127.0.0.1:8080/player_api.php || true; pm2 logs nexlify-iptv-edge --lines 15 --nostream`
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
