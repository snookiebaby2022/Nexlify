#!/usr/bin/env bash
# Nexlify Panel Watchdog — runs every 5 minutes via cron.
# Keeps nexlify / cron / license healthy WITHOUT fighting nginx or in-progress updates.
#
# NEVER start the panel with PORT=80 -i max — that steals nginx's port and causes 502 loops.
set -euo pipefail

PANEL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/var/log/nexlify-watchdog.log"
PM2_APP="nexlify"
CRON_APP="nexlify-cron"
LICENSE_APP="nexlify-license"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Rotate log if > 5MB
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
  mv "$LOG" "$LOG.old" 2>/dev/null || true
fi

cd "$PANEL_DIR"
set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-13000}}"
HOST="${PANEL_BIND_HOST:-127.0.0.1}"
[ "$HOST" = "0.0.0.0" ] && HOST="127.0.0.1"
HEALTH_URL="http://${HOST}:${PORT}/api/health"

update_in_progress() {
  # Clear stale markers left by a crashed update worker (was blocking restarts forever).
  clear_stale_update_marker() {
    local marker="$PANEL_DIR/.update-in-progress"
    [ -f "$marker" ] || return 0
    local pid
    pid="$(tr -d '[:space:]' < "$marker" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 1 # still alive — do not clear
    fi
    if pgrep -f 'panel-update-background' >/dev/null 2>&1; then
      return 1
    fi
    if pgrep -f 'next build' >/dev/null 2>&1 || pgrep -f 'npm run build' >/dev/null 2>&1; then
      return 1
    fi
    log "CLEAR: stale .update-in-progress (worker dead) — allowing panel recovery"
    rm -f "$marker" "$PANEL_DIR/.update-progress.pid" 2>/dev/null || true
    if [ -f "$PANEL_DIR/.update-progress.json" ] && grep -q '"status"[[:space:]]*:[[:space:]]*"running"' "$PANEL_DIR/.update-progress.json" 2>/dev/null; then
      node -e '
        const fs=require("fs");
        const p=process.argv[1];
        try {
          const j=JSON.parse(fs.readFileSync(p,"utf8"));
          if (j.status!=="running") return;
          const step=String(j.currentStep||"");
          const progress=Number(j.progress)||0;
          const nearEnd =
            progress >= 94 ||
            step === "pm2 restart nexlify" ||
            (step === "prepare standalone" && progress >= 90) ||
            (step === "apply update" && progress >= 88) ||
            (Array.isArray(j.steps) && j.steps.some(s => s && s.name === "pm2 restart nexlify" && (s.ok || s.status === "done")));
          j.finishedAt=new Date().toISOString();
          j.currentStep=null;
          if (nearEnd) {
            // Build already swapped; worker died during PM2 restart — this is success, not failure.
            j.status="done";
            j.progress=100;
            j.message="Update completed. Panel restarted on the new build (watchdog recovered after PM2 swap — that is normal).";
          } else {
            j.status="failed";
            j.message="Update worker died — cleared by watchdog. Panel will be restarted. Retry from Settings → Updates if needed.";
          }
          fs.writeFileSync(p, JSON.stringify(j,null,2));
        } catch {}
      ' "$PANEL_DIR/.update-progress.json" 2>/dev/null || true
    fi
    return 0
  }
  clear_stale_update_marker || true

  if [ -f "$PANEL_DIR/.update-in-progress" ]; then
    local pid
    pid="$(tr -d '[:space:]' < "$PANEL_DIR/.update-in-progress" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    if pgrep -f 'panel-update-background' >/dev/null 2>&1; then
      return 0
    fi
    if pgrep -f 'next build' >/dev/null 2>&1 || pgrep -f 'npm run build' >/dev/null 2>&1; then
      return 0
    fi
    # Marker file with dead PID — treat as not in progress
    return 1
  fi
  if [ -f "$PANEL_DIR/.update-progress.pid" ]; then
    local pid
    pid="$(tr -d '[:space:]' < "$PANEL_DIR/.update-progress.pid" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  if [ -f "$PANEL_DIR/.update-progress.json" ]; then
    if grep -q '"status"[[:space:]]*:[[:space:]]*"running"' "$PANEL_DIR/.update-progress.json" 2>/dev/null; then
      # Only treat as in-progress if a worker is still alive
      if pgrep -f 'panel-update-background' >/dev/null 2>&1; then
        return 0
      fi
      if pgrep -f 'npm run build' >/dev/null 2>&1 || pgrep -f 'next build' >/dev/null 2>&1; then
        return 0
      fi
    fi
  fi
  return 1
}

if update_in_progress; then
  log "SKIP: panel update in progress — not restarting (avoids 502 during build)"
  exit 0
fi

pm2_status() {
  local name="$1"
  pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == '$name':
            print((p.get('pm2_env') or {}).get('status') or 'unknown')
            raise SystemExit
    print('not_found')
except Exception:
    print('error')
" 2>/dev/null || echo "error"
}

safe_restart_panel() {
  if [ -f "$PANEL_DIR/scripts/nexlify-migrate-guard.sh" ]; then
    # shellcheck disable=SC1091
    . "$PANEL_DIR/scripts/nexlify-migrate-guard.sh"
    if nexlify_migrate_in_progress; then
      log "SKIP restart: SQL migration in progress"
      return 0
    fi
  fi
  log "FIX: restarting panel via panel-restart-safe / pm2-start (PORT=${PORT})"
  if [ -f "$PANEL_DIR/scripts/panel-restart-safe.sh" ]; then
    bash "$PANEL_DIR/scripts/panel-restart-safe.sh" --nexlify-only >>"$LOG" 2>&1 || true
  elif [ -f "$PANEL_DIR/scripts/pm2-start.sh" ]; then
    bash "$PANEL_DIR/scripts/pm2-start.sh" >>"$LOG" 2>&1 || true
  else
    pm2 delete "$PM2_APP" 2>/dev/null || true
    cd "$PANEL_DIR" && pm2 start ecosystem.config.cjs --only "$PM2_APP" --update-env >>"$LOG" 2>&1 || true
  fi
}

# --- Check 1: PM2 processes ---
STATUS="$(pm2_status "$PM2_APP")"
if [ "$STATUS" != "online" ]; then
  log "WARN: $PM2_APP is $STATUS"
  safe_restart_panel
fi

CRON_STATUS="$(pm2_status "$CRON_APP")"
if [ "$CRON_STATUS" != "online" ]; then
  log "WARN: $CRON_APP is $CRON_STATUS — restarting"
  pm2 restart "$CRON_APP" 2>/dev/null || {
    pm2 delete "$CRON_APP" 2>/dev/null || true
    cd "$PANEL_DIR" && pm2 start ecosystem.config.cjs --only "$CRON_APP" --update-env 2>/dev/null || true
  }
fi

# License is optional on some hosts
if [ -f "$PANEL_DIR/.license-keys/private.pem" ] || [ -n "${LICENSE_SERVER_PRIVATE_PEM:-}" ]; then
  LIC_STATUS="$(pm2_status "$LICENSE_APP")"
  if [ "$LIC_STATUS" != "online" ] && [ "$LIC_STATUS" != "not_found" ]; then
    log "WARN: $LICENSE_APP is $LIC_STATUS — restarting"
    pm2 restart "$LICENSE_APP" 2>/dev/null || true
  fi
fi

# --- Check 2: Upstream health (never assume public :80 is the Node bind port) ---
HTTP_CODE="$(curl -sS -o /tmp/nexlify-watchdog-health.json -w '%{http_code}' -m 5 "$HEALTH_URL" 2>/dev/null || echo 000)"
APP_OK=0
if grep -q '"app":"ok"' /tmp/nexlify-watchdog-health.json 2>/dev/null; then
  APP_OK=1
fi
rm -f /tmp/nexlify-watchdog-health.json

if [ "$HTTP_CODE" != "200" ] && [ "$APP_OK" != "1" ]; then
  log "WARN: upstream health $HEALTH_URL → HTTP $HTTP_CODE — safe restart"
  safe_restart_panel
  sleep 5
  HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 5 "$HEALTH_URL" 2>/dev/null || echo 000)"
  if [ "$HTTP_CODE" != "200" ]; then
    log "ERROR: still unhealthy after safe restart ($HTTP_CODE) — running panel-update-recover --quick"
    if [ -f "$PANEL_DIR/scripts/panel-update-recover.sh" ]; then
      bash "$PANEL_DIR/scripts/panel-update-recover.sh" --quick >>"$LOG" 2>&1 || true
    fi
  fi
fi

# --- Check 3: Standalone build ---
if [ ! -f "$PANEL_DIR/.next/standalone/server.js" ]; then
  log "ERROR: standalone build missing — recover (not a blind PORT=80 cluster start)"
  if [ -f "$PANEL_DIR/scripts/panel-update-recover.sh" ]; then
    bash "$PANEL_DIR/scripts/panel-update-recover.sh" --quick >>"$LOG" 2>&1 || \
      bash "$PANEL_DIR/scripts/panel-update-recover.sh" >>"$LOG" 2>&1 || true
  fi
fi

# --- Check 4: Postgres / Redis ---
if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  log "ERROR: PostgreSQL not responding — restarting"
  systemctl restart postgresql 2>/dev/null || service postgresql restart 2>/dev/null || true
fi
if command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
  log "WARN: Redis not responding — restarting"
  systemctl restart redis-server 2>/dev/null || systemctl restart redis 2>/dev/null || true
fi

# --- Check 5: Disk ---
DISK_PCT="$(df / | awk 'NR==2 {print $5}' | tr -d '%' || echo 0)"
if [ "${DISK_PCT:-0}" -gt 90 ] 2>/dev/null; then
  log "WARN: Disk usage at ${DISK_PCT}% — cleaning old PM2 logs"
  find /root/.pm2/logs -name "*.log" -mtime +3 -delete 2>/dev/null || true
fi

log "OK: Watchdog check complete (upstream=$HEALTH_URL HTTP=${HTTP_CODE:-?} disk=${DISK_PCT:-?}%)"
