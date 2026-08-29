#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const uri = `/live/${creds.u}/${encodeURIComponent(creds.p)}/1476023810.ts`;
  const p = new (require("@prisma/client").PrismaClient)();
  const { host, port, user, password } = await get10gbsServer(p);
  await withSshClient({ host, port, user, password }, async (c) => {
    await sshExec(c, "pm2 flush nexlify-iptv-edge 2>/dev/null; pm2 restart nexlify-iptv-edge --update-env 2>&1 | tail -3");
    await sshExec(c, "sleep 2; pm2 set nexlify-iptv-edge:IPTV_EDGE_DEBUG_UPSTREAM 1 2>/dev/null; IPTV_EDGE_DEBUG_UPSTREAM=1 pm2 restart nexlify-iptv-edge --update-env 2>&1 | tail -2");
    await sshExec(c, "sleep 2");
    const r = await sshExec(
      c,
      `curl -sS -m 20 -o /tmp/b.bin -A 'VLC/3.0.20' 'http://127.0.0.1:8080${uri}'; wc -c /tmp/b.bin; pm2 logs nexlify-iptv-edge --lines 30 --nostream 2>&1`
    );
    console.log(r.stdout);
    const g = await sshExec(c, "grep -n 'no-splice\\|iptv-edge-auth' /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs | head -5");
    console.log("=== edge file markers ===\n" + g.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
