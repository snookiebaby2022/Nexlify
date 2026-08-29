#!/usr/bin/env node
/**
 * Fix 10gbs RAM + streams:
 * 1) Purge legacy XUI tmpfs at /home/xui/content/streams (~56GB RAM)
 * 2) Point edge auth at panel nginx :8080 (panel :13000 is localhost-only)
 */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const PANEL_PUBLIC = process.env.PANEL_PUBLIC_HOST || "45.88.138.18";
const STREAMS_TMPFS = "/home/xui/content/streams";

function patchEnv(content, key, val) {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${val}`;
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

const FIX_SHELL = `
set -euo pipefail
echo "=== BEFORE ==="
df -h ${STREAMS_TMPFS} 2>/dev/null || true
free -h | head -2
echo "=== Stop legacy XUI stream daemons (Nexlify edge serves live) ==="
for pid in $(pgrep -f 'LLOD\\[' 2>/dev/null || true); do
  kill -TERM "$pid" 2>/dev/null || true
done
sleep 2
echo "=== Purge tmpfs stream cache ==="
find ${STREAMS_TMPFS} -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
sync
echo "=== AFTER ==="
df -h ${STREAMS_TMPFS} 2>/dev/null || true
free -h | head -2
awk '/MemTotal|MemAvailable|Shmem|AnonPages/ {print}' /proc/meminfo
`;

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const creds = await get10gbsServer(p);
  await withSshClient(creds, async (c) => {
    console.log("[10gbs] purging XUI tmpfs + fixing edge backend...");
    const fix = await sshExec(c, FIX_SHELL, { timeoutMs: 120_000 });
    console.log(fix.stdout);

    const envPath = "/opt/nexlify-panel/.env";
    const read = await sshExec(c, `test -f ${envPath} && cat ${envPath} || echo ''`);
    let env = read.stdout || "";
    env = patchEnv(env, "IPTV_EDGE_BACKEND", `${PANEL_PUBLIC}:8080`);
    const b64 = Buffer.from(env, "utf8").toString("base64");
    await sshExec(c, `echo '${b64}' | base64 -d > ${envPath}`);

    await sshExec(
      c,
      `grep -q '^IPTV_EDGE_BACKEND=' ${envPath} && sed -i 's|^IPTV_EDGE_BACKEND=.*|IPTV_EDGE_BACKEND=${PANEL_PUBLIC}:8080|' ${envPath} || echo 'IPTV_EDGE_BACKEND=${PANEL_PUBLIC}:8080' >> ${envPath}`
    );

    const auth = await sshExec(
      c,
      `curl -sf -m 8 -o /dev/null -w 'panel8080_health:%{http_code}\\n' http://${PANEL_PUBLIC}:8080/api/health || echo panel8080_health:fail`
    );
    console.log(auth.stdout.trim());

    const restart = await sshExec(
      c,
      `cd /opt/nexlify-panel && pm2 delete nexlify-iptv-edge 2>/dev/null || true && IPTV_EDGE_BACKEND=${PANEL_PUBLIC}:8080 bash scripts/install-iptv-edge-proxy.sh 2>&1 | tail -5`
    );
    console.log(restart.stdout);

    const verify = await sshExec(
      c,
      `sleep 4 && pm2 env 0 2>/dev/null | grep IPTV_EDGE_BACKEND; pm2 logs nexlify-iptv-edge --lines 8 --nostream 2>&1 | tail -10`
    );
    console.log(verify.stdout);
  });
  await p.$disconnect();
  console.log("FIX_10GBS_OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
