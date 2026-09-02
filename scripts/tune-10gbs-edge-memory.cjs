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
  IPTV_EDGE_LIVE_FAN_LINGER_MS: "12000",
  IPTV_EDGE_ON_DEMAND_FAN_LINGER_MS: "25000",
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
      "cd /opt/nexlify-panel && pm2 restart nexlify-iptv-edge --update-env 2>/dev/null; sleep 2; free -h; echo '---'; pm2 status nexlify-iptv-edge 2>/dev/null || pm2 list | head -8"
    );
    console.log(restart.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
