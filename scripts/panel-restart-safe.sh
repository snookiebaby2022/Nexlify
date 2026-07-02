#!/usr/bin/env bash
# Safe panel restart — used by updates, install, and the health watchdog.
#
# Modes:
#   (default)        Full pm2-start.sh (nexlify + cron + license)
#   --nexlify-only   Restart only the nexlify app (does not touch nexlify-cron)
#   --detach         Run restart in a new session (survives parent PM2 recycle)
#   --run            Internal: detached worker entrypoint
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_FILE="${PANEL_RESTART_LOG:-/tmp/nexlify-panel-restart.log}"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"
}

load_env() {
  sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
  if [ -x scripts/ensure-panel-env.sh ]; then
    ./scripts/ensure-panel-env.sh
  fi
  set -a
  [ -f .env ] && . ./.env
  set +a
}

verify_panel() {
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if ./scripts/verify-panel-upstream.sh >>"$LOG_FILE" 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

nexlify_only_restart() {
  load_env

  if ! command -v pm2 >/dev/null 2>&1; then
    log "ERROR: pm2 not in PATH"
    return 1
  fi
  if ! bash scripts/has-valid-next-build.sh 2>/dev/null; then
    log "Missing valid .next — running panel-update-recover.sh"
    if [ -x scripts/panel-update-recover.sh ]; then
      if bash scripts/panel-update-recover.sh --quick >>"$LOG_FILE" 2>&1; then
        log "Recovered via backup"
        return 0
      fi
      if bash scripts/panel-update-recover.sh >>"$LOG_FILE" 2>&1; then
        log "Recovered via rebuild"
        return 0
      fi
    fi
    log "ERROR: missing .next — run: bash scripts/panel-update-recover.sh"
    return 1
  fi

  log "Restarting nexlify only (preserving nexlify-cron) ..."
  if command -v pm2 >/dev/null 2>&1; then
    for _ in 1 2 3 4 5 6; do
      remaining="$(pm2 jlist 2>/dev/null | node -e "
        const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
        process.stdout.write(String(list.filter((p) => p.name === 'nexlify').length));
      " 2>/dev/null || echo 0)"
      [ "$remaining" = "0" ] && break
      pm2 jlist 2>/dev/null | node -e "
        const { execSync } = require('child_process');
        const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
        for (const x of list.filter((p) => p.name === 'nexlify')) {
          try { execSync('pm2 delete ' + x.pm_id, { stdio: 'ignore' }); } catch {}
        }
      " 2>/dev/null || true
      pm2 delete nexlify 2>/dev/null || true
      sleep 1
    done
  fi
  pm2 delete nexlify 2>/dev/null || true
  pm2 start ecosystem.config.cjs --only nexlify --update-env >>"$LOG_FILE" 2>&1
  pm2 save >>"$LOG_FILE" 2>&1 || true

  if verify_panel; then
    log "nexlify-only restart OK"
    return 0
  fi
  log "ERROR: nexlify started but health check failed"
  pm2 logs nexlify --lines 15 --nostream >>"$LOG_FILE" 2>&1 || true
  return 1
}

full_restart() {
  log "Full panel restart via pm2-start.sh ..."
  # Ensure dependencies are installed before restart (handles new packages from git pull)
  if [ -f "$ROOT/package.json" ]; then
    npm install --no-audit --no-fund --loglevel=error >>"$LOG_FILE" 2>&1 || true
  fi
  bash "$ROOT/scripts/pm2-start.sh" >>"$LOG_FILE" 2>&1
}

run_restart() {
  local mode="${1:-full}"
  : >"$LOG_FILE"
  log "panel-restart-safe ($mode) from $ROOT"
  if [ "$mode" = "nexlify-only" ]; then
    nexlify_only_restart
  else
    full_restart
  fi
}

MODE="full"
case "${1:-}" in
  --nexlify-only) MODE="nexlify-only" ;;
  --detach)
    if command -v setsid >/dev/null 2>&1; then
      setsid bash "$0" --run "$MODE" >>"$LOG_FILE" 2>&1 &
    else
      nohup bash "$0" --run "$MODE" >>"$LOG_FILE" 2>&1 &
    fi
    log "Detached restart started (mode=$MODE, pid=$!)"
    exit 0
    ;;
  --run)
    run_restart "${2:-full}"
    exit $?
    ;;
  --nexlify-only|--full|"")
    ;;
  *)
    echo "Usage: $0 [--nexlify-only] [--detach] [--run [full|nexlify-only]]" >&2
    exit 1
    ;;
esac

run_restart "$MODE"
