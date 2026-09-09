#!/usr/bin/env node
/** SSH to 10gbs stream server and tune iptv-edge env + restart PM2. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const TUNING = {
  IPTV_EDGE_MAX_LIVE_FANS: "2048",
  IPTV_EDGE_HLS_SEG_CACHE_MB: "128",
  IPTV_EDGE_UPSTREAM_SOCKETS: "4096",
  IPTV_EDGE_LIVE_SOCKETS: "2048",
  IPTV_EDGE_LIVE_FAN_LINGER_MS: "120000",
  IPTV_EDGE_ON_DEMAND_FAN_LINGER_MS: "120000",
  IPTV_EDGE_FAN_PREFIX_BYTES: "1048576",
  /** Clear hung fans that dump prefix then silent-underrun (provider 5xx / junki stalls). */
  IPTV_EDGE_FAN_STALL_MS: "12000",
  IPTV_EDGE_FAN_STALL_SWEEP_MS: "3000",
  /** 0 = hold signed CDN URL like VLC until stall/death (avoids mid-GOP video freeze). */
  IPTV_EDGE_FAN_AUTH_REFRESH_MS: "0",
  IPTV_EDGE_AUTH_CACHE_MS: "120000",
  IPTV_EDGE_CATALOG_CACHE_MS: "180000",
};

function patchEnv(content, key, val) {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${val}`;
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

(async () => {
  const p = new (require("@prisma/client").PrismaClient)();
  const { host, port, user, password } = await get10gbsServer(p);
  await withSshClient({ host, port, user, password }, async (c) => {
    const envPath = "/opt/nexlify-panel/.env";
    const read = await sshExec(c, `test -f ${envPath} && cat ${envPath} || echo ''`);
    let env = read.stdout || "";
    for (const [k, v] of Object.entries(TUNING)) {
      env = patchEnv(env, k, v);
    }
    const b64 = Buffer.from(env, "utf8").toString("base64");
    await sshExec(c, `echo '${b64}' | base64 -d > ${envPath}`);
    console.log("[10gbs] env tuned:", TUNING);

    const restart = await sshExec(
      c,
      [
        "set -euo pipefail",
        "cd /opt/nexlify-panel",
        "set -a",
        "[ -f .env ] && . ./.env",
        "set +a",
        // Force VLC-like signed-URL hold even if dump had 180000.
        "export IPTV_EDGE_FAN_AUTH_REFRESH_MS=0",
        "pm2 restart nexlify-iptv-edge --update-env",
        "sleep 2",
        "free -h",
        "echo '---'",
        "pm2 status nexlify-iptv-edge 2>/dev/null || pm2 list | head -8",
        "echo '--- AUTH_REFRESH ---'",
        "pm2 env 0 2>/dev/null | grep IPTV_EDGE_FAN_AUTH_REFRESH_MS || true",
        "PID=$(pm2 pid nexlify-iptv-edge 2>/dev/null || true)",
        'if [ -n "${PID:-}" ] && [ -r "/proc/$PID/environ" ]; then tr "\\0" "\\n" < "/proc/$PID/environ" | grep IPTV_EDGE_FAN_AUTH_REFRESH_MS || true; fi',
      ].join("\n")
    );
    console.log(restart.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
