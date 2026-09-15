#!/usr/bin/env node
/**
 * 10gbs: coalesce same-URL fans (stop 4× junki pulls) + chunked connection pulses.
 * Restarts nexlify-iptv-edge once (brief reconnect). Run on panel host (45).
 *
 *   node scripts/apply-10gbs-coalesce-pulse.cjs
 *   EDGE_SRC=/tmp/iptv-edge-proxy.mjs node scripts/apply-10gbs-coalesce-pulse.cjs
 */
const fs = require("fs");
const path = require("path");
const ROOT = fs.existsSync("/opt/nexlify-panel/scripts/ssh-10gbs-lib.cjs")
  ? "/opt/nexlify-panel"
  : path.join(__dirname, "..");
process.chdir(ROOT);
require(path.join(ROOT, "scripts/load-env.cjs")).loadEnv();

const { get10gbsServer, withSshClient, sshExec } = require(path.join(ROOT, "scripts/ssh-10gbs-lib.cjs"));

const EDGE_SRC =
  process.env.EDGE_SRC ||
  path.join(ROOT, "scripts/iptv-edge-proxy.mjs");

async function main() {
  if (!fs.existsSync(EDGE_SRC)) throw new Error(`missing edge source: ${EDGE_SRC}`);
  const body = fs.readFileSync(EDGE_SRC, "utf8");
  if (!body.includes("IPTV_EDGE_COALESCE_SAME_URL")) {
    throw new Error("edge source missing IPTV_EDGE_COALESCE_SAME_URL support");
  }
  if (!body.includes("const CHUNK = 80")) {
    throw new Error("edge source missing chunked flushConnectionPulseBatch");
  }

  const { PrismaClient } = require(path.join(ROOT, "node_modules/@prisma/client"));
  const p = new PrismaClient();
  const s = await get10gbsServer(p);

  await withSshClient(
    { host: s.host, port: s.port, username: s.user, password: s.password },
    async (c) => {
      const before = await sshExec(
        c,
        [
          "echo '=== BEFORE health ==='",
          "curl -sS -m 3 http://127.0.0.1:8080/edge/health || true",
          "echo",
          "echo '=== BEFORE env ==='",
          "grep -E 'IPTV_EDGE_COALESCE|NEXLIFY_MEDIA' /opt/nexlify-panel/.env 2>/dev/null || true",
          "echo '=== BEFORE ports ==='",
          "ss -lntp | grep -E ':80|:443|:8080|:25461' || true",
        ].join("\n")
      );
      process.stdout.write(before.stdout);
      if (before.stderr) process.stderr.write(before.stderr);

      const envSet = await sshExec(
        c,
        [
          "ENV=/opt/nexlify-panel/.env",
          "touch \"$ENV\"",
          "if grep -q '^IPTV_EDGE_COALESCE_SAME_URL=' \"$ENV\"; then",
          "  sed -i 's/^IPTV_EDGE_COALESCE_SAME_URL=.*/IPTV_EDGE_COALESCE_SAME_URL=1/' \"$ENV\"",
          "else",
          "  printf '\\nIPTV_EDGE_COALESCE_SAME_URL=1\\n' >> \"$ENV\"",
          "fi",
          "grep '^IPTV_EDGE_COALESCE_SAME_URL=' \"$ENV\"",
        ].join("\n")
      );
      process.stdout.write(envSet.stdout);
      if (envSet.code !== 0) throw new Error(envSet.stderr || "failed to set COALESCE env");

      await sshExec(c, "chattr -i /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs 2>/dev/null || true");
      const up = await sshExec(c, "cat > /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs", {
        stdin: body,
        timeoutMs: 120_000,
      });
      if (up.code !== 0) throw new Error(up.stderr || "edge upload failed");
      const upRoot = await sshExec(c, "cat > /opt/nexlify-panel/iptv-edge-proxy.mjs", {
        stdin: body,
        timeoutMs: 120_000,
      });
      if (upRoot.code !== 0) throw new Error(upRoot.stderr || "root edge upload failed");

      const restart = await sshExec(
        c,
        [
          "cd /opt/nexlify-panel",
          "pm2 restart nexlify-iptv-edge",
          "sleep 6",
          "chattr +i scripts/iptv-edge-proxy.mjs 2>/dev/null || true",
          "echo '=== AFTER health ==='",
          "curl -sS -m 5 http://127.0.0.1:8080/edge/health || true",
          "echo",
          "echo '=== AFTER ports ==='",
          "ss -lntp | grep -E ':80|:443|:8080|:25461' || true",
          "echo '=== COALESCE in running process ==='",
          "tr '\\0' '\\n' < /proc/$(pgrep -n -f 'iptv-edge-proxy.mjs' | head -1)/environ 2>/dev/null | grep COALESCE || true",
          "grep -n 'const CHUNK = 80' scripts/iptv-edge-proxy.mjs | head",
          "grep -n 'encodingVariant' /opt/nexlify-panel/iptv-edge-proxy.mjs | head",
        ].join("\n"),
        { timeoutMs: 60_000 }
      );
      process.stdout.write(restart.stdout);
      if (restart.stderr) process.stderr.write(restart.stderr);
      if (restart.code !== 0) throw new Error("edge restart failed");
    }
  );

  await p.$disconnect();
  console.log("COALESCE_PULSE_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
