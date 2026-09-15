#!/usr/bin/env node
/** Push edge companion modules to 10gbs and restart nexlify-iptv-edge. Run on panel. */
const fs = require("fs");
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

async function pushFile(c, localRel, remotePath) {
  const body = fs.readFileSync(path.join(__dirname, localRel));
  const w = await sshExec(c, `cat > ${remotePath}`, { stdin: body, timeoutMs: 60_000 });
  if (w.code !== 0) throw new Error(`upload ${localRel}: ${w.stderr || w.stdout}`);
  console.log(`pushed ${localRel} (${body.length} bytes) -> ${remotePath}`);
}

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    await pushFile(c, "edge-redis-slots.mjs", "/opt/nexlify-panel/scripts/edge-redis-slots.mjs");
    if (fs.existsSync(path.join(__dirname, "edge-redis-auth.mjs"))) {
      await pushFile(c, "edge-redis-auth.mjs", "/opt/nexlify-panel/scripts/edge-redis-auth.mjs");
    }
    const r = await sshExec(
      c,
      `
set -e
ls -la /opt/nexlify-panel/scripts/edge-redis-slots.mjs
pm2 restart nexlify-iptv-edge --update-env
sleep 3
ss -lntp | grep -E ':8080|:80 ' || true
curl -sS -m 5 -w '\\nlocal8080=%{http_code}\\n' http://127.0.0.1:8080/edge/health | head -c 400; echo
tail -15 /root/.pm2/logs/nexlify-iptv-edge-error.log 2>/dev/null || true
`,
      { timeoutMs: 60_000 }
    );
    process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.code !== 0) process.exitCode = 1;
  });
  // verify from panel
  const { execSync } = require("child_process");
  console.log("--- panel -> 10gbs ---");
  try {
    console.log(
      execSync(
        "curl -sS -m 8 -w 'http=%{http_code}\\n' http://209.237.141.15:8080/edge/health",
        { encoding: "utf8" }
      )
    );
  } catch (e) {
    console.log(String(e.stdout || e.message));
    process.exitCode = 1;
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
