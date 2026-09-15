#!/usr/bin/env node
/**
 * Harden 10gbs media ports so leftover XUI cannot steal them from
 * nexlify-iptv-edge after reboot.
 *
 * Actions (on 10gbs via SSH):
 * - systemctl disable --now xuione (files left in place)
 * - stop leftover XUI nginx/nginx_rtmp if still running
 * - keep XUI listen confs on 18080/18443
 * - install/enable nexlify-edge-claim-80 (kills only XUI holders of :80)
 * - keep pm2-root After=xuione drop-in
 *
 * Run on panel (Prisma + decrypt key required):
 *   node scripts/harden-10gbs-edge-ports.cjs
 *
 * Companion remote body: scripts/harden-10gbs-edge-ports-remote.sh
 */
const fs = require("fs");
const path = require("path");

process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const remotePath = path.join(__dirname, "harden-10gbs-edge-ports-remote.sh");
const remoteBody = fs.readFileSync(remotePath, "utf8");

(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  console.log(`Hardening 10gbs ${s.host} ...`);
  await withSshClient(
    { host: s.host, port: s.port, username: s.user, password: s.password },
    async (c) => {
      const r = await sshExec(c, "bash -s", {
        timeoutMs: 120_000,
        stdin: remoteBody,
      });
      process.stdout.write(r.stdout || "");
      if (r.stderr) process.stderr.write(r.stderr);
      if (r.code) throw new Error(`remote exit ${r.code}`);
    }
  );
  await p.$disconnect();
  console.log("harden-10gbs-edge-ports: done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
