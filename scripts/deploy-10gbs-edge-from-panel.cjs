#!/usr/bin/env node
/**
 * XUI-style: deploy IPTV edge + stream agent on 10gbs from the panel host.
 * Upstream fetches use the stream-server IP; auth hits panel live-auth via agent token.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const PANEL_HOST = process.env.PANEL_PUBLIC_HOST || "45.88.138.18";
/** Panel Next.js binds 127.0.0.1:13000 — remote edges must auth via nginx :8080. */
const PANEL_BACKEND = `${PANEL_HOST}:${process.env.PANEL_PUBLIC_PORT || process.env.STREAM_HTTP_PORT || "8080"}`;
const REMOTE_DIR = "/opt/nexlify-panel";

const SYNC_PATHS = [
  "scripts/iptv-edge-proxy.mjs",
  "scripts/edge-redis-auth.mjs",
  "scripts/install-iptv-edge-proxy.sh",
  "scripts/install-remote-edge-node.sh",
  "scripts/install-remote-stream-agent.sh",
  "scripts/nexlify-stream-agent.sh",
  "scripts/tune-streaming-host.sh",
  "scripts/tune-kernel-20k.sh",
  "scripts/nexlify-port-registry.sh",
  "scripts/nexlify-nginx-release-ports.sh",
  "scripts/fix-panel-https-default.sh",
  "scripts/wait-panel-ready.sh",
  "scripts/verify-iptv-playback.sh",
  "package.json",
  "package-lock.json",
];

function panelSecret() {
  return (
    process.env.PANEL_INTERNAL_SECRET ||
    process.env.PANEL_API_SECRET ||
    process.env.NEXLIFY_PANEL_API_SECRET ||
    ""
  );
}

function tarBundle() {
  const existing = SYNC_PATHS.filter((p) => fs.existsSync(path.join(process.cwd(), p)));
  if (!existing.length) throw new Error("No files to sync for remote edge");
  const args = ["-czf", "-", ...existing];
  const r = spawnSync("tar", args, { cwd: process.cwd(), encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`tar failed: ${r.stderr?.toString("utf8") || r.status}`);
  }
  return r.stdout;
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const { server, host, port, user, password } = await get10gbsServer(p);

  if (!server.agentToken) {
    throw new Error("Run ensure-10gbs-agent-token.cjs first");
  }
  const secret = panelSecret();
  if (!secret) throw new Error("PANEL_INTERNAL_SECRET missing in .env");

  const bundle = tarBundle();
  const panelUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") || `http://${PANEL_HOST}:13000`;

  const remoteEnv = [
    `PANEL_BACKEND=${PANEL_BACKEND}`,
    `IPTV_EDGE_BACKEND=${PANEL_BACKEND}`,
    `PANEL_URL=${panelUrl}`,
    `AGENT_TOKEN=${server.agentToken}`,
    `IPTV_EDGE_AGENT_TOKEN=${server.agentToken}`,
    `IPTV_EDGE_SERVER_ID=${server.id}`,
    `INTERNAL_API_SECRET=${secret}`,
    `PANEL_INTERNAL_SECRET=${secret}`,
    `NEXLIFY_USE_IPTV_EDGE=1`,
    `STREAM_HTTP_EXTRA_PORTS=8080,25461`,
    `IPTV_EDGE_HTTP_PORTS=8080,25461`,
    `IPTV_EDGE_HTTPS_PORTS=`,
    `IPTV_EDGE_TRUST_XFF=loopback,45.88.138.18`,
  ].join("\n");

  console.log(`Deploying edge to ${host} (server ${server.name}, ${server.id})…`);

  await withSshClient({ host, port, username: user, password }, async (client) => {
    await sshExec(client, `mkdir -p ${REMOTE_DIR}/scripts ${REMOTE_DIR}/.next 2>/dev/null; true`);

    const upload = await sshExec(client, `cd ${REMOTE_DIR} && tar xzf -`, {
      stdin: bundle,
      timeoutMs: 120_000,
    });
    if (upload.code !== 0) throw new Error(`tar extract failed: ${upload.stderr}`);

    const envWrite = await sshExec(client, `cat > ${REMOTE_DIR}/.env.remote-edge <<'ENVEOF'\n${remoteEnv}\nENVEOF`);
    if (envWrite.code !== 0) throw new Error(envWrite.stderr);

    const install = await sshExec(
      client,
      [
        "set -euo pipefail",
        `cd ${REMOTE_DIR}`,
        "export DEBIAN_FRONTEND=noninteractive",
        "command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)",
        "command -v pm2 >/dev/null || npm install -g pm2",
        "command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg curl ca-certificates)",
        "touch .env",
        "while IFS= read -r line || [ -n \"$line\" ]; do",
        '  [ -z "$line" ] && continue',
        '  k="${line%%=*}"',
        '  v="${line#*=}"',
        '  if grep -q "^${k}=" .env 2>/dev/null; then',
        '    sed -i "s|^${k}=.*|${k}=${v}|" .env',
        "  else",
        '    echo "${k}=${v}" >> .env',
        "  fi",
        "done < .env.remote-edge",
        "if [ ! -d node_modules ]; then npm ci --omit=dev 2>/dev/null || npm install --omit=dev 2>/dev/null || true; fi",
        `PANEL_BACKEND='${PANEL_BACKEND}' INTERNAL_API_SECRET='${secret.replace(/'/g, "'\\''")}' AGENT_TOKEN='${server.agentToken}' PANEL_URL='${panelUrl}' bash scripts/install-remote-edge-node.sh`,
        "sleep 3",
        "curl -s -m 15 -A 'VLC/3.0.20' -o /tmp/up.bin -w 'direct_upstream=%{http_code} bytes=%{size_download}\\n' 'https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5' || true",
        "head -c 4 /tmp/up.bin | xxd | head -1 || true",
        "pm2 list 2>/dev/null | head -10 || true",
        "ss -tlnp | grep -E ':8080|:25461' || true",
        "echo REMOTE_EDGE_DEPLOY_OK",
      ].join("\n"),
      { timeoutMs: 600_000 }
    );
    process.stdout.write(install.stdout);
    process.stderr.write(install.stderr);
    if (install.code !== 0 || !install.stdout.includes("REMOTE_EDGE_DEPLOY_OK")) {
      throw new Error(`remote install failed (exit ${install.code})`);
    }
  });

  console.log(JSON.stringify({ ok: true, remote: host, backend: PANEL_BACKEND, serverId: server.id }, null, 2));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
