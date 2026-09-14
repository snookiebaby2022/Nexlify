#!/usr/bin/env node
/**
 * Raise 10gbs software caps so the 10G NIC is the ceiling, not maxFans=2048.
 * Restarts nexlify-iptv-edge WITHOUT --update-env (script re-reads IPTV_EDGE_* from .env).
 * Brief client reconnect.
 *
 *   node scripts/apply-10gbs-nic-ceiling.cjs
 */
const path = require("path");
const ROOT = require("fs").existsSync("/opt/nexlify-panel/scripts/ssh-10gbs-lib.cjs")
  ? "/opt/nexlify-panel"
  : path.join(__dirname, "..");
process.chdir(ROOT);
require(path.join(ROOT, "scripts/load-env.cjs")).loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require(path.join(ROOT, "scripts/ssh-10gbs-lib.cjs"));

const PATCH = {
  IPTV_EDGE_MAX_LIVE_FANS: "8000",
  IPTV_EDGE_LIVE_SOCKETS: "8192",
  IPTV_EDGE_UPSTREAM_SOCKETS: "8192",
  IPTV_EDGE_ADMIN_SOCKETS: "512",
  IPTV_EDGE_VOD_SOCKETS: "1024",
  IPTV_EDGE_COALESCE_SAME_URL: "1",
};

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  await withSshClient(
    { host: s.host, port: s.port, username: s.user, password: s.password },
    async (c) => {
      const envLines = Object.entries(PATCH)
        .map(
          ([k, v]) =>
            `if grep -q '^${k}=' "$ENV"; then sed -i 's|^${k}=.*|${k}=${v}|' "$ENV"; else printf '\\n${k}=${v}\\n' >> "$ENV"; fi`
        )
        .join("\n");
      const r = await sshExec(
        c,
        [
          "set -euo pipefail",
          "ENV=/opt/nexlify-panel/.env",
          "touch \"$ENV\"",
          envLines,
          "echo '=== patched ==='",
          "grep -E '^IPTV_EDGE_(MAX_LIVE_FANS|LIVE_SOCKETS|UPSTREAM_SOCKETS|ADMIN_SOCKETS|VOD_SOCKETS|COALESCE)' \"$ENV\"",
          "mkdir -p /etc/security/limits.d",
          "printf '* soft nofile 1048576\\n* hard nofile 1048576\\nroot soft nofile 1048576\\nroot hard nofile 1048576\\n' > /etc/security/limits.d/99-nexlify-edge.conf",
          "if [ -d /etc/systemd/system/pm2-root.service.d ] || systemctl cat pm2-root >/dev/null 2>&1; then",
          "  mkdir -p /etc/systemd/system/pm2-root.service.d",
          "  printf '[Service]\\nLimitNOFILE=1048576\\n' > /etc/systemd/system/pm2-root.service.d/nofile.conf",
          "  systemctl daemon-reload || true",
          "fi",
          "cd /opt/nexlify-panel",
          "pm2 restart nexlify-iptv-edge",
          "sleep 6",
          "echo '=== health ==='",
          "curl -sS -m 5 http://127.0.0.1/edge/health; echo",
          "echo '=== nofile ==='",
          "PID=$(pgrep -n -f 'iptv-edge-proxy.mjs' || true)",
          'if [ -n "${PID:-}" ]; then awk "{print}" /proc/$PID/limits | grep "open files" || true; fi',
        ].join("\n"),
        { timeoutMs: 60_000 }
      );
      process.stdout.write(r.stdout || "");
      if (r.stderr) process.stderr.write(r.stderr);
      if (r.code) throw new Error(`remote exit ${r.code}`);
    }
  );
  await p.$disconnect();
  console.log("NIC_CEILING_OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
