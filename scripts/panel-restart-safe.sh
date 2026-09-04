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
  chmod +x scripts/*.sh 2>/dev/null || true
  if [ -f scripts/ensure-panel-env.sh ]; then
    bash scripts/ensure-panel-env.sh
  fi
  set -a
  [ -f .env ] && . ./.env
  set +a
  if [ -x scripts/prune-stale-live-connections.sh ]; then
    bash scripts/prune-stale-live-connections.sh >>"$LOG_FILE" 2>&1 || true
  fi
}

verify_panel() {
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if bash scripts/verify-panel-upstream.sh >>"$LOG_FILE" 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# Only warm cheap panel routes. Hitting player_api.php / live-auth on Next with a
# million-row catalog pins every cluster worker so /login and /api/health stop answering.
warmup_playback_routes() {
  local port="${PORT:-13000}"
  local i
  log "Warming panel routes on :${port} (health + login only) ..."
  for i in 1 2 3 4; do
    curl -sS -m 8 -o /dev/null "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1 || true
    curl -sS -m 8 -o /dev/null "http://127.0.0.1:${port}/login" >/dev/null 2>&1 || true
  done
}

nexlify_online_count() {
  pm2 jlist 2>/dev/null | node -e "
    try {
      const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      process.stdout.write(String(list.filter((p) => p.name === 'nexlify' && p.pm2_env && p.pm2_env.status === 'online').length));
    } catch { process.stdout.write('0'); }
  " 2>/dev/null || echo 0
}

start_nexlify_without_delete() {
  if [ "$(nexlify_online_count)" != "0" ]; then
    log "Reloading nexlify in place (no delete) ..."
    if pm2 reload nexlify --update-env >>"$LOG_FILE" 2>&1; then
      return 0
    fi
    log "reload failed — restart in place"
    if pm2 restart nexlify --update-env >>"$LOG_FILE" 2>&1; then
      return 0
    fi
  fi
  log "Starting nexlify (process was down) ..."
  pm2 start ecosystem.config.cjs --only nexlify --update-env >>"$LOG_FILE" 2>&1
}

restore_next_backup_if_needed() {
  if bash scripts/has-valid-next-build.sh 2>/dev/null; then
    return 0
  fi
  if [ -d .next.backup ] && { [ -f .next.backup/BUILD_ID ] || [ -f .next.backup/standalone/server.js ]; }; then
    log "Restoring .next.backup after failed restart"
    rm -rf .next
    mv .next.backup .next
    return 0
  fi
  return 1
}

nexlify_only_restart() {
  load_env

  if [ -f "$ROOT/scripts/nexlify-migrate-guard.sh" ]; then
    # shellcheck disable=SC1091
    . "$ROOT/scripts/nexlify-migrate-guard.sh"
    if ! nexlify_refuse_restart_if_migrating; then
      log "SKIP: nexlify restart blocked — SQL migration in progress"
      return 1
    fi
  fi

  local panel_down=0
  [ "$(nexlify_online_count)" = "0" ] && panel_down=1

  if [ "$panel_down" != "1" ] && [ -f "$ROOT/scripts/nexlify-streaming-guard.sh" ]; then
    # shellcheck disable=SC1091
    . "$ROOT/scripts/nexlify-streaming-guard.sh"
    if ! nexlify_refuse_restart_if_streaming_busy; then
      log "SKIP: nexlify restart blocked — IPTV streaming load (use NEXLIFY_FORCE_RESTART=1)"
      return 1
    fi
  fi

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

  if [ -x scripts/ensure-nginx-panel-hold.sh ]; then
    bash scripts/ensure-nginx-panel-hold.sh >>"$LOG_FILE" 2>&1 || true
  fi

  log "Restarting nexlify only (preserving nexlify-cron, no pm2 delete) ..."
  start_nexlify_without_delete
  pm2 save >>"$LOG_FILE" 2>&1 || true

  if verify_panel; then
    warmup_playback_routes
    # shellcheck disable=SC1091
    if [ -f "$ROOT/scripts/panel-no-local-iptv-edge.sh" ]; then
      . "$ROOT/scripts/panel-no-local-iptv-edge.sh"
    fi
    if type nexlify_panel_must_not_run_iptv_edge >/dev/null 2>&1 && nexlify_panel_must_not_run_iptv_edge; then
      log "Skip iptv-edge rematch — nginx owns live :8080 on this panel"
      nexlify_stop_panel_local_iptv_edge
    elif [ -x scripts/rematch-iptv-edge-auth.sh ]; then
      if bash scripts/rematch-iptv-edge-auth.sh >>"$LOG_FILE" 2>&1; then
        log "iptv-edge auth rematch OK"
      else
        log "WARN: iptv-edge auth rematch failed — playback may 403 until fixed"
      fi
    fi
    log "nexlify-only restart OK"
    return 0
  fi

  log "ERROR: nexlify started but health check failed — restoring previous build"
  pm2 logs nexlify --lines 15 --nostream >>"$LOG_FILE" 2>&1 || true
  if restore_next_backup_if_needed; then
    start_nexlify_without_delete
    pm2 save >>"$LOG_FILE" 2>&1 || true
    if verify_panel; then
      log "Recovered previous build after failed restart"
      return 0
    fi
  fi
  return 1
}

full_restart() {
  log "Full panel restart via pm2-start.sh ..."
  # Ensure dependencies are installed before restart (handles new packages from git pull)
  if [ -f "$ROOT/package.json" ]; then
    npm install --no-audit --no-fund --loglevel=error >>"$LOG_FILE" 2>&1 || true
  fi
  bash "$ROOT/scripts/pm2-start.sh" >>"$LOG_FILE" 2>&1
  load_env
  warmup_playback_routes || true
  # shellcheck disable=SC1091
  if [ -f "$ROOT/scripts/panel-no-local-iptv-edge.sh" ]; then
    . "$ROOT/scripts/panel-no-local-iptv-edge.sh"
  fi
  if type nexlify_panel_must_not_run_iptv_edge >/dev/null 2>&1 && nexlify_panel_must_not_run_iptv_edge; then
    log "Skip iptv-edge rematch — nginx owns live :8080 on this panel"
    nexlify_stop_panel_local_iptv_edge
  elif [ -x scripts/rematch-iptv-edge-auth.sh ]; then
    bash scripts/rematch-iptv-edge-auth.sh >>"$LOG_FILE" 2>&1 || log "WARN: iptv-edge auth rematch failed"
  fi
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
