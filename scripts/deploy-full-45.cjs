#!/usr/bin/env node
/**
 * Upload all local uncommitted panel files → 45.88.138.18, rebuild, verify, push edge.
 * Usage: DEPLOY_PASS='...' node scripts/deploy-full-45.cjs
 */
const { Client } = require("ssh2");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HOST = process.env.DEPLOY_HOST || "45.88.138.18";
const USER = process.env.DEPLOY_USER || "root";
const PASS = process.env.DEPLOY_PASS || "";
const REMOTE_DIR = process.env.DEPLOY_DIR || "/opt/nexlify-panel";
const REMOTE_TAR = "/tmp/nexlify-deploy-bundle.tgz";

if (!PASS) {
  console.error("Set DEPLOY_PASS environment variable");
  process.exit(1);
}

function collectFiles() {
  const out = new Set();
  const diff = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" });
  const untracked = execSync("git ls-files --others --exclude-standard", {
    cwd: ROOT,
    encoding: "utf8",
  });
  for (const block of [diff, untracked]) {
    for (const line of block.split(/\r?\n/)) {
      const f = line.trim().replace(/\\/g, "/");
      if (!f) continue;
      if (f.startsWith("graft/")) continue;
      if (f.includes("node_modules/")) continue;
      if (f.startsWith(".next/")) continue;
      const abs = path.join(ROOT, f);
      if (fs.existsSync(abs)) out.add(f);
    }
  }
  return [...out].sort();
}

function exec(conn, cmd, timeoutMs = 900_000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (d) => {
        const s = d.toString();
        stdout += s;
        process.stdout.write(s);
      });
      stream.stderr.on("data", (d) => {
        const s = d.toString();
        stderr += s;
        process.stderr.write(s);
      });
      const timer = setTimeout(() => {
        stream.close();
        reject(new Error(`timeout after ${timeoutMs}ms: ${cmd.slice(0, 120)}`));
      }, timeoutMs);
      stream.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`exit ${code}: ${stderr.slice(-500)}`));
        else resolve(stdout);
      });
    });
  });
}

function sftpUpload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const rs = fs.createReadStream(localPath);
      const ws = sftp.createWriteStream(remotePath);
      ws.on("close", () => resolve());
      ws.on("error", reject);
      rs.on("error", reject);
      rs.pipe(ws);
    });
  });
}

async function main() {
  const files = collectFiles();
  console.log(`=== Packaging ${files.length} files ===`);
  const listPath = path.join(ROOT, ".deploy-files.txt");
  const tarPath = path.join(ROOT, ".deploy-bundle.tgz");
  fs.writeFileSync(listPath, files.join("\n"));
  execSync(`tar -czf "${tarPath}" -T "${listPath}"`, { cwd: ROOT, stdio: "inherit" });
  const sizeMb = (fs.statSync(tarPath).size / (1024 * 1024)).toFixed(2);
  console.log(`Bundle ${sizeMb} MB`);

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn
      .on("ready", resolve)
      .on("error", reject)
      .connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30_000 });
  });

  try {
    console.log("=== Upload bundle ===");
    await sftpUpload(conn, tarPath, REMOTE_TAR);

    const remoteScript = `
set -euo pipefail
cd '${REMOTE_DIR}'
echo "=== Extract ${files.length} files ==="
tar -xzf '${REMOTE_TAR}'
sed -i 's/\\r$//' scripts/*.sh scripts/*.mjs 2>/dev/null || true
chmod +x scripts/*.sh scripts/*.mjs 2>/dev/null || true
if [ -f nginx/nexlify-panel-http.conf ]; then
  cp -f nginx/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-http.conf 2>/dev/null || true
fi
bash scripts/lock-live-routing-45.sh unlock 2>/dev/null || chattr -i scripts/iptv-edge-proxy.mjs /etc/nginx/conf.d/nexlify-panel-http.conf 2>/dev/null || true
export NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT=1 NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1
echo "=== Prisma + staging build (node 1 pipeline) ==="
npx prisma generate
npx prisma migrate deploy
bash scripts/panel-update-pipeline.sh build
bash scripts/panel-update-pipeline.sh apply
pm2 restart nexlify-cron --update-env 2>/dev/null || true
nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
bash scripts/lock-live-routing-45.sh 2>/dev/null || true
echo "=== Topology verify ==="
npx tsx scripts/verify-playback-topology.mjs 2>/dev/null || bash scripts/check-live-routing-drift.sh || true
echo "=== Deploy 10gbs edge ==="
node scripts/deploy-10gbs-edge-from-panel.cjs 2>&1 || echo "WARN: edge deploy skipped/failed"
echo "=== Smoke ==="
curl -fsS -m 15 http://127.0.0.1:13000/api/health; echo
curl -sS -m 8 -o /dev/null -w "panel8080_live=%{http_code}\\n" http://127.0.0.1:8080/live/_probe/_probe/0.ts || true
curl -sS -m 15 -o /dev/null -w "player_api_head=%{http_code}\\n" "http://127.0.0.1:8080/player_api.php" || true
echo DEPLOY_FULL_45_OK
`;

    console.log("=== Remote rebuild + verify (may take several minutes) ===");
    await exec(conn, remoteScript, 1_800_000);
  } finally {
    conn.end();
    try {
      fs.unlinkSync(listPath);
      fs.unlinkSync(tarPath);
    } catch {
      /* ignore */
    }
  }
  console.log("=== Local deploy finished ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
