#!/usr/bin/env bash
# Detect wedged panel workers (health timeout while PM2 shows online) and recover
# WITHOUT restarting the whole cluster or IPTV edge — one worker at a time.
#
# Safe during live traffic: prune slots → optional single-worker recycle.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
LOG="${NEXLIFY_WEDGE_GUARD_LOG:-/var/log/nexlify-wedge-guard.log}"
STATE="${NEXLIFY_WEDGE_GUARD_STATE:-/var/run/nexlify-wedge-guard.state}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

[ -d "$PANEL_DIR" ] || exit 0
cd "$PANEL_DIR"
set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-13000}}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
HEALTH_TIMEOUT="${NEXLIFY_HEALTH_TIMEOUT_SEC:-3}"
WEDGE_RSS_MB="${NEXLIFY_WORKER_WEDGE_RSS_MB:-2800}"
COOLDOWN_SEC="${NEXLIFY_WEDGE_RECYCLE_COOLDOWN_SEC:-90}"

if [ -x "$PANEL_DIR/scripts/prune-stale-live-connections.sh" ]; then
  bash "$PANEL_DIR/scripts/prune-stale-live-connections.sh" >>"$LOG" 2>&1 || true
fi

health_probe() {
  curl -sS -m "$HEALTH_TIMEOUT" -o /dev/null -w '%{http_code} %{time_total}' "$HEALTH_URL" 2>/dev/null || echo "000 ${HEALTH_TIMEOUT}"
}

read_state() {
  [ -f "$STATE" ] || return 0
  # shellcheck disable=SC1090
  . "$STATE" 2>/dev/null || true
}

write_state() {
  mkdir -p "$(dirname "$STATE")"
  printf 'last_recycle=%s\nfail_streak=%s\nlast_proactive=%s\n' "${last_recycle:-0}" "${fail_streak:-0}" "${last_proactive:-0}" > "$STATE"
}

read_state
now=$(date +%s)
fail_streak="${fail_streak:-0}"

# Proactive recycle: fat workers wedge the event loop before PM2 memory restart fires.
proactive_recycle() {
  last_proactive="${last_proactive:-0}"
  if [ "$((now - last_proactive))" -lt "$COOLDOWN_SEC" ]; then
    return 1
  fi
  if ! command -v pm2 >/dev/null 2>&1; then return 1; fi
  export NEXLIFY_WORKER_WEDGE_RSS_MB="$WEDGE_RSS_MB"
  worst="$(pm2 jlist 2>/dev/null | node -e '
const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
const workers = list.filter((p) => p.name === "nexlify" && (p.pm2_env?.status === "online"));
if (!workers.length) process.exit(2);
workers.sort((a, b) => (b.monit?.memory || 0) - (a.monit?.memory || 0));
const w = workers[0];
const rssMb = Math.round((w.monit?.memory || 0) / 1024 / 1024);
const threshold = Number(process.env.NEXLIFY_WORKER_WEDGE_RSS_MB || "2800");
if (rssMb < threshold) process.exit(3);
process.stdout.write(String(w.pid) + " " + rssMb);
' 2>/dev/null || true)"
  if [ -z "$worst" ]; then return 1; fi
  pid="${worst%% *}"
  rss_mb="${worst#* }"
  online_count="$(pm2 jlist 2>/dev/null | node -e '
const n=JSON.parse(require("fs").readFileSync(0,"utf8")).filter(p=>p.name==="nexlify"&&p.pm2_env?.status==="online").length;
console.log(n);
' 2>/dev/null || echo 0)"
  if [ "${online_count:-0}" -le 0 ]; then return 1; fi
  log "PROACTIVE recycle pid=${pid} rss=${rss_mb}MB (threshold=${WEDGE_RSS_MB}MB)"
  kill -9 "$pid" 2>/dev/null || true
  last_proactive=$now
  last_recycle=$now
  fail_streak=0
  write_state
  return 0
}

probe="$(health_probe)"
code="${probe%% *}"
time_s="${probe#* }"

if [ "$code" = "200" ] && awk "BEGIN{exit !($time_s < 2.5)}" 2>/dev/null; then
  fail_streak=0
  write_state
  proactive_recycle || true
  exit 0
fi

fail_streak=$((fail_streak + 1))
log "WARN health code=${code} time=${time_s}s fail_streak=${fail_streak}"

if [ -x "$PANEL_DIR/scripts/flush-live-connections.cjs" ] && [ "$fail_streak" -ge 2 ]; then
  node "$PANEL_DIR/scripts/flush-live-connections.cjs" >>"$LOG" 2>&1 || true
  probe="$(health_probe)"
  code="${probe%% *}"
  time_s="${probe#* }"
  if [ "$code" = "200" ]; then
    log "OK recovered after connection flush"
    fail_streak=0
    write_state
    exit 0
  fi
fi

last_recycle="${last_recycle:-0}"
if [ "$((now - last_recycle))" -lt "$COOLDOWN_SEC" ]; then
  log "SKIP recycle: cooldown (${COOLDOWN_SEC}s)"
  write_state
  exit 0
fi

if [ "$fail_streak" -lt 2 ]; then
  write_state
  exit 0
fi

if ! command -v pm2 >/dev/null 2>&1; then
  write_state
  exit 0
fi

export NEXLIFY_WORKER_WEDGE_RSS_MB="$WEDGE_RSS_MB"
export NEXLIFY_WEDGE_FORCE_RECYCLE=1
worst="$(pm2 jlist 2>/dev/null | node -e '
const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
const workers = list.filter((p) => p.name === "nexlify" && (p.pm2_env?.status === "online"));
if (!workers.length) process.exit(2);
workers.sort((a, b) => (b.monit?.memory || 0) - (a.monit?.memory || 0));
const w = workers[0];
const rssMb = Math.round((w.monit?.memory || 0) / 1024 / 1024);
const threshold = Number(process.env.NEXLIFY_WORKER_WEDGE_RSS_MB || "2800");
const force = process.env.NEXLIFY_WEDGE_FORCE_RECYCLE === "1";
if (!force && rssMb < threshold && workers.length > 2) process.exit(3);
process.stdout.write(String(w.pid) + " " + rssMb);
' 2>/dev/null || true)"

if [ -z "$worst" ]; then
  log "SKIP recycle: no online nexlify worker to recycle"
  write_state
  exit 0
fi

pid="${worst%% *}"
rss_mb="${worst#* }"
online_count="$(pm2 jlist 2>/dev/null | node -e '
const n=JSON.parse(require("fs").readFileSync(0,"utf8")).filter(p=>p.name==="nexlify"&&p.pm2_env?.status==="online").length;
console.log(n);
' 2>/dev/null || echo 0)"

want="${PANEL_INSTANCES:-2}"
if [ "${NEXLIFY_STREAMING_OPTIMIZED:-0}" != "1" ]; then
  want=$(( ${PANEL_INSTANCES:-4} + ${NEXLIFY_PANEL_WORKER_SPARE:-1} ))
fi
if [ "${online_count:-0}" -le "${want}" ]; then
  log "RECYCLE at worker cap (${online_count}/${want}) pid=${pid} rss=${rss_mb}MB (health=${code} time=${time_s}s)"
else
  log "RECYCLE wedged worker pid=${pid} rss=${rss_mb}MB (health=${code} time=${time_s}s)"
fi
kill -9 "$pid" 2>/dev/null || true
last_recycle=$now
fail_streak=0
write_state
sleep 2

probe="$(health_probe)"
code="${probe%% *}"
log "post-recycle health=${code}"
