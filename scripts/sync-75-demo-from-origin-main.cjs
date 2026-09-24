#!/usr/bin/env node
/**
 * Sync demo Main (75) to origin/main, rebuild, re-apply classic LB + live routing lock.
 * Usage: node scripts/sync-75-demo-from-origin-main.cjs
 * Auth: SSH key (BatchMode) to root@75.119.137.174 — or DEPLOY_PASS / P75.
 */
const { Client } = require("ssh2");
const { spawnSync } = require("child_process");

const HOST = process.env.DEPLOY_HOST_75 || "75.119.137.174";
const USER = process.env.DEPLOY_USER || "root";
const PASS = process.env.P75 || process.env.DEPLOY_PASS || "";

const remoteScript = `
set -euo pipefail
cd /opt/nexlify-panel
bash scripts/lock-live-routing.sh unlock 2>/dev/null || true
echo "=== Before ==="
git log -1 --oneline
echo "=== Fetch + hard reset origin/main ==="
git fetch origin main
git reset --hard origin/main
git clean -fd -e .env -e node_modules -e .next -e .next.backup -e reports -e tmp 2>/dev/null || true
git log -1 --oneline
export NEXLIFY_ALLOW_PROTECTED_75=1 NEXLIFY_FORCE_BUILD=1
echo "=== Prisma + build + apply ==="
npx prisma generate
npx prisma migrate deploy
bash scripts/panel-update-pipeline.sh build
bash scripts/panel-update-pipeline.sh apply
pm2 restart nexlify-cron --update-env 2>/dev/null || true

# Demo LB must match customer install docs: PANEL_URL hits Next on 13000 when co-located.
if [ -f /etc/nexlify-lb/lb.env ]; then
  if grep -qE '^PANEL_URL=http://127\\.0\\.0\\.1/?$' /etc/nexlify-lb/lb.env; then
    sed -i 's|^PANEL_URL=.*|PANEL_URL=http://127.0.0.1:13000|' /etc/nexlify-lb/lb.env
    echo "fixed PANEL_URL -> http://127.0.0.1:13000"
  fi
  # Ensure internal secret matches panel when present
  if [ -f /opt/nexlify-panel/.env ]; then
    SECRET=\$(grep -E '^PANEL_INTERNAL_SECRET=' /opt/nexlify-panel/.env | head -1 | cut -d= -f2- | tr -d '\\r')
    if [ -n "\$SECRET" ]; then
      if grep -q '^PANEL_INTERNAL_SECRET=' /etc/nexlify-lb/lb.env; then
        sed -i "s|^PANEL_INTERNAL_SECRET=.*|PANEL_INTERNAL_SECRET=\${SECRET}|" /etc/nexlify-lb/lb.env
      elif grep -q '^AGENT_TOKEN=' /etc/nexlify-lb/lb.env; then
        # keep AGENT_TOKEN; also set PANEL_INTERNAL_SECRET if auth uses it
        grep -q '^PANEL_INTERNAL_SECRET=' /etc/nexlify-lb/lb.env || echo "PANEL_INTERNAL_SECRET=\${SECRET}" >> /etc/nexlify-lb/lb.env
      fi
      echo "synced PANEL_INTERNAL_SECRET from panel .env"
    fi
  fi
fi

echo "=== Classic LB upgrade (customer install path) ==="
export PANEL_URL="\${PANEL_URL:-http://127.0.0.1:13000}"
bash scripts/classic-lb/upgrade.sh || bash scripts/classic-lb/install.sh
nginx -t
systemctl reload nginx
systemctl restart php8.4-fpm 2>/dev/null || systemctl restart php8.3-fpm 2>/dev/null || true

echo "=== Live routing lock (demo = what customers must ship) ==="
bash scripts/lock-live-routing.sh 2>/dev/null || true

echo "=== Smoke ==="
curl -fsS -m 10 http://127.0.0.1:13000/api/health; echo
curl -fsS -m 10 http://127.0.0.1:8090/lb/health; echo
# Panel media paths must NOT 200 with TS (502 is correct when locked)
code=\$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1/live/demo/demo/1.ts || true)
echo "panel_/live_code=\$code (expect 502)"
bash scripts/classic-lb/smoke.sh 2>/dev/null | tail -40 || true
echo SYNC_75_DEMO_OK
`;

function runViaSsh2() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => {
        conn.exec(remoteScript, { pty: false }, (err, stream) => {
          if (err) return reject(err);
          stream.on("data", (d) => process.stdout.write(d));
          stream.stderr.on("data", (d) => process.stderr.write(d));
          stream.on("close", (code) => {
            conn.end();
            resolve(code || 0);
          });
        });
      })
      .on("error", reject)
      .connect({
        host: HOST,
        port: 22,
        username: USER,
        password: PASS || undefined,
        readyTimeout: 30000,
        // Prefer agent/keys when no password
        tryKeyboard: false,
      });
  });
}

function runViaOpenSsh() {
  const r = spawnSync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20", `${USER}@${HOST}`, "bash", "-s"],
    { input: remoteScript, stdio: ["pipe", "inherit", "inherit"], encoding: "utf8" }
  );
  return r.status || 0;
}

(async () => {
  let code = 1;
  if (PASS) {
    try {
      code = await runViaSsh2();
    } catch (e) {
      console.error("ssh2 failed, falling back to OpenSSH key:", e.message);
      code = runViaOpenSsh();
    }
  } else {
    code = runViaOpenSsh();
  }
  process.exit(code);
})();
