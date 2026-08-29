#!/usr/bin/env node
/** Push iptv-edge-proxy.mjs to 10gbs and restart edge. Run on panel host. */
const fs = require("fs");
const path = require("path");
process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

async function main() {
  const edgePath = path.join(__dirname, "iptv-edge-proxy.mjs");
  try {
    const { execSync } = require("child_process");
    const attrsLong = execSync(`lsattr -l "${edgePath}" 2>/dev/null || true`, { encoding: "utf8" });
    const attrsShort = execSync(`lsattr "${edgePath}" 2>/dev/null || true`, { encoding: "utf8" });
    const immutable = /\bImmutable\b/i.test(attrsLong) || /^[^\s]*i[^\s]*\s/m.test(attrsShort);
    if (immutable) {
      console.error("LIVE_ROUTING_LOCKED: iptv-edge-proxy.mjs is immutable. Unlock: bash scripts/lock-live-routing-45.sh unlock");
      process.exit(1);
    }
  } catch {
    /* lsattr missing */
  }
  const body = fs.readFileSync(edgePath, "utf8");
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const s = await get10gbsServer(p);

  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const w = await sshExec(c, "cat > /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs", {
      stdin: body,
      timeoutMs: 120_000,
    });
    if (w.code !== 0) throw new Error(w.stderr || "upload failed");
    const r = await sshExec(
      c,
      "cd /opt/nexlify-panel && pm2 restart nexlify-iptv-edge --update-env && sleep 8 && ss -tlnp | grep 8080 && curl -sS -m 3 -o /dev/null -w 'local:%{http_code}\\n' http://127.0.0.1:8080/player_api.php || true"
    );
    process.stdout.write(r.stdout);
    if (r.code !== 0) process.stderr.write(r.stderr);
  });

  await p.$disconnect();
  console.log("PUSH_EDGE_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
