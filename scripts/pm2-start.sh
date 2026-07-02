#!/usr/bin/env bash
# Start or restart Nexlify with PM2. Run from project root after npm run build.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true

# Ensure tsx is available (required for background update worker)
if ! command -v npx >/dev/null 2>&1 || ! npx tsx --version >/dev/null 2>&1; then
  echo "Installing tsx (required for panel updates) ..."
  npm install -g tsx 2>/dev/null || npm install -g tsx --prefix /usr/local 2>/dev/null || echo "WARN: tsx install failed — updates may not work until installed manually"
fi

./scripts/ensure-panel-env.sh

set -a
[ -f .env ] && . ./.env
set +a

EXPECTED_PORT="${PORT:-${PANEL_PORT:-3000}}"
EXPECTED_BIND="${PANEL_BIND_HOST:-127.0.0.1}"
echo "Panel port from env: ${EXPECTED_PORT} (website: ${WEBSITE_PORT:-${STREAM_HTTP_PORT:-3001}})"

# IP installs bind :80 — free stale listeners before PM2 start (orphan cluster workers).
free_stale_panel_port() {
  local port="$1"
  if ! ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    return 0
  fi
  local online
  online="$(pm2 jlist 2>/dev/null | node -e "
    try {
      const l = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      const n = l.find((x) => x.name === 'nexlify' && x.pm2_env?.status === 'online');
      process.stdout.write(n ? '1' : '0');
    } catch { process.stdout.write('0'); }
  " 2>/dev/null || echo 0)"
  if [ "$online" = "1" ]; then
    return 0
  fi
  echo "WARN: port ${port} in use but nexlify not online — clearing orphan listeners"
  pm2 jlist 2>/dev/null | node -e "
    const { execSync } = require('child_process');
    try {
      for (const x of JSON.parse(require('fs').readFileSync(0, 'utf8')).filter((p) => p.name === 'nexlify')) {
        try { execSync('pm2 delete ' + x.pm_id, { stdio: 'ignore' }); } catch {}
      }
    } catch {}
  " 2>/dev/null || true
  pm2 delete nexlify 2>/dev/null || true
  pkill -f 'next/dist/bin/next' 2>/dev/null || true
  pkill -f '.next/standalone/server' 2>/dev/null || true
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
  sleep 2
}
free_stale_panel_port "$EXPECTED_PORT"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed or not in PATH."
  echo "Install: sudo npm install -g pm2"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is not in PATH. Install Node 18+ or load nvm: source ~/.nvm/nvm.sh"
  exit 1
fi

if ! bash scripts/has-valid-next-build.sh 2>/dev/null; then
  echo "Missing valid .next — running: npm install && npm run build"
  npm install --no-audit --no-fund --loglevel=error || true
  npm run build || exit 1
fi

# Always ensure standalone static assets are fresh (prevents CSS/JS breakage after updates)
if [ -f "$ROOT/.next/standalone/server.js" ]; then
  bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
fi

normalize_exec_mode() {
  case "${1:-}" in
    cluster|cluster_mode) echo "cluster" ;;
    fork|fork_mode) echo "fork" ;;
    *) echo "${1:-}" ;;
  esac
}

pm2_app_meta() {
  local name="$1"
  pm2 jlist 2>/dev/null | node -e "
    const name = process.argv[1];
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const app = list.find((x) => x.name === name);
    if (!app) process.exit(0);
    const env = app.pm2_env || {};
    const args = Array.isArray(env.args) ? env.args.join(' ') : String(env.args || '');
    const port = args.match(/-p\s+(\d+)/)?.[1] || env.PORT || '';
    const bind = args.match(/-H\s+(\S+)/)?.[1] || env.PANEL_BIND_HOST || '';
    process.stdout.write(
      JSON.stringify({
        cwd: env.pm_cwd || '',
        port: String(port),
        bind: String(bind),
        exec: env.exec_mode || '',
        instances: String(env.instances ?? ''),
        script: env.pm_exec_path || '',
      })
    );
  " "$name"
}

needs_reregister() {
  local name="$1"
  local meta cwd port bind script exec instances
  if ! pm2 describe "$name" >/dev/null 2>&1; then
    return 0
  fi
  meta="$(pm2_app_meta "$name")"
  [ -z "$meta" ] && return 0
  cwd="$(node -e "const m=JSON.parse(process.argv[1]);process.stdout.write(m.cwd||'')" "$meta")"
  port="$(node -e "const m=JSON.parse(process.argv[1]);process.stdout.write(m.port||'')" "$meta")"
  bind="$(node -e "const m=JSON.parse(process.argv[1]);process.stdout.write(m.bind||'')" "$meta")"
  script="$(node -e "const m=JSON.parse(process.argv[1]);process.stdout.write(m.script||'')" "$meta")"
  exec="$(node -e "const m=JSON.parse(process.argv[1]);process.stdout.write(m.exec||'')" "$meta")"
  instances="$(node -e "const m=JSON.parse(process.argv[1]);process.stdout.write(m.instances||'')" "$meta")"

  STANDALONE_DIR="$ROOT/.next/standalone"
  if [ -n "$cwd" ] && [ "$cwd" != "$ROOT" ] && [ "$cwd" != "$STANDALONE_DIR" ]; then
    echo "$name: wrong cwd $cwd (expected $ROOT or $STANDALONE_DIR)"
    return 0
  fi
  if [ "$name" = "nexlify" ]; then
    if [ -n "$port" ] && [ "$port" != "$EXPECTED_PORT" ]; then
      echo "$name: wrong port $port (expected $EXPECTED_PORT)"
      return 0
    fi
    if [ -n "$bind" ] && [ "$bind" != "$EXPECTED_BIND" ]; then
      echo "$name: wrong bind $bind (expected $EXPECTED_BIND)"
      return 0
    fi
    case "$script" in
      *"$ROOT"*) ;;
      *)
        if [ -n "$script" ]; then
          echo "$name: script outside deploy tree: $script"
          return 0
        fi
        ;;
    esac
  fi
  # Detect exec_mode or instance count changes (critical for cluster mode upgrades)
  local expected_exec expected_instances
  expected_exec="$(node -e "
    const cfg = require('./ecosystem.config.cjs');
    const app = cfg.apps.find((a) => a.name === '$name');
    process.stdout.write(app?.exec_mode || '');
  ")"
  expected_instances="$(node -e "
    const cfg = require('./ecosystem.config.cjs');
    const app = cfg.apps.find((a) => a.name === '$name');
    process.stdout.write(String(app?.instances ?? ''));
  ")"
  if [ -n "$expected_exec" ] && [ "$(normalize_exec_mode "$exec")" != "$(normalize_exec_mode "$expected_exec")" ]; then
    echo "$name: exec_mode changed from '$exec' to '$expected_exec' — re-registering"
    return 0
  fi
  if [ -n "$expected_instances" ] && [ "$instances" != "$expected_instances" ]; then
    echo "$name: instances changed from '$instances' to '$expected_instances' — re-registering"
    return 0
  fi
  return 1
}

ensure_pm2_app() {
  local name="$1"
  if [ "$name" = "nexlify" ]; then
    for _ in 1 2 3 4 5 6; do
      remaining="$(pm2 jlist 2>/dev/null | node -e "
        const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
        process.stdout.write(String(list.filter((p) => p.name === 'nexlify').length));
      " 2>/dev/null || echo 0)"
      [ "$remaining" = "0" ] && break
      pm2 jlist 2>/dev/null | node -e "
        const { execSync } = require('child_process');
        for (const x of JSON.parse(require('fs').readFileSync(0, 'utf8')).filter((p) => p.name === 'nexlify')) {
          try { execSync('pm2 delete ' + x.pm_id, { stdio: 'ignore' }); } catch {}
        }
      " 2>/dev/null || true
      pm2 delete nexlify 2>/dev/null || true
      sleep 1
    done
  fi
  if [ "$name" = "nexlify" ] && [ -f "$ROOT/.next/standalone/server.js" ]; then
    bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
    bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || {
      echo "WARN: standalone assets incomplete — copying static files before PM2 start"
      bash "$ROOT/scripts/prepare-standalone.sh"
      bash "$ROOT/scripts/verify-standalone.sh"
    }
  fi
  if needs_reregister "$name"; then
    pm2 delete "$name" 2>/dev/null || true
    echo "Starting $name from $ROOT..."
    pm2 start ecosystem.config.cjs --only "$name" --update-env
    if [ "$name" = "nexlify" ]; then
      echo "Waiting for nexlify cluster..."
      bash scripts/wait-panel-ready.sh || echo "WARN: nexlify still starting (will verify again at end)"
    fi
    return 0
  fi
  echo "Restarting $name..."
  pm2 restart "$name" --update-env
}

ensure_pm2_app nexlify
ensure_pm2_app nexlify-cron

if [ -f .license-keys/private.pem ] || [ -n "${LICENSE_SERVER_PRIVATE_PEM:-}" ]; then
  if needs_reregister nexlify-license; then
    pm2 delete nexlify-license 2>/dev/null || true
    echo "Starting nexlify-license (port ${LICENSE_SERVER_PORT:-8787})..."
    pm2 start ecosystem.config.cjs --only nexlify-license --update-env
  else
    echo "Restarting nexlify-license..."
    pm2 restart nexlify-license --update-env
  fi
else
  echo "Skip nexlify-license: no .license-keys/private.pem on this host"
fi

pm2 save

if ! ./scripts/verify-panel-upstream.sh; then
  echo "ERROR: PM2 started but upstream check failed — nginx will return 502"
  exit 1
fi

echo ""
echo "Status:"
pm2 status
echo ""
echo "Logs: pm2 logs nexlify"
if ./scripts/pm2-boot-enabled.sh 2>/dev/null; then
  echo "Boot on reboot: enabled (PM2 will restore saved apps)"
else
  echo ""
  echo ">>> Panel will NOT start after a server reboot until you run:"
  echo ">>>   ./scripts/pm2-boot-enable.sh"
fi
