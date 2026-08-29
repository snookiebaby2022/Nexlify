#!/usr/bin/env bash
# Sustained-load guard for panel hosts. It never restarts nginx, PostgreSQL,
# Redis, or the IPTV edge and therefore cannot interrupt media playback.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
LOG="${NEXLIFY_RESOURCE_GUARD_LOG:-/var/log/nexlify-resource-guard.log}"
STATE_DIR="${NEXLIFY_RESOURCE_GUARD_STATE_DIR:-/var/lib/nexlify}"
STATE="$STATE_DIR/resource-guard.state"
SNAPSHOT="$STATE_DIR/resource-guard.json"
LOCK="/var/run/nexlify-resource-guard.lock"

mkdir -p "$STATE_DIR" "$(dirname "$LOG")"
exec 9>"$LOCK"
flock -n 9 || exit 0

if [ -f "$PANEL_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PANEL_DIR/.env"
  set +a
fi

clamp_threshold() {
  local value="${1:-75}"
  [[ "$value" =~ ^[0-9]+$ ]] || value=75
  [ "$value" -lt 50 ] && value=50
  [ "$value" -gt 95 ] && value=95
  echo "$value"
}

THRESHOLD="$(clamp_threshold "${NEXLIFY_RESOURCE_HEADROOM_PERCENT:-75}")"
SUSTAINED="${NEXLIFY_RESOURCE_SUSTAINED_SAMPLES:-3}"
[[ "$SUSTAINED" =~ ^[0-9]+$ ]] || SUSTAINED=3
[ "$SUSTAINED" -lt 2 ] && SUSTAINED=2

read_cpu() {
  awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print idle,total; exit}' /proc/stat
}

read -r idle1 total1 < <(read_cpu)
sleep 1
read -r idle2 total2 < <(read_cpu)
delta_total=$((total2 - total1))
delta_idle=$((idle2 - idle1))
if [ "$delta_total" -gt 0 ]; then
  cpu=$((100 * (delta_total - delta_idle) / delta_total))
else
  cpu=0
fi

read -r mem_total mem_available < <(
  awk '
    /^MemTotal:/ { total=$2 }
    /^MemAvailable:/ { available=$2 }
    END { print total+0, available+0 }
  ' /proc/meminfo
)
if [ "$mem_total" -gt 0 ]; then
  ram=$((100 * (mem_total - mem_available) / mem_total))
else
  ram=0
fi
disk="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5+0}')"

cpu_streak=0
ram_streak=0
disk_streak=0
last_action=0
if [ -f "$STATE" ]; then
  # shellcheck disable=SC1090
  . "$STATE" 2>/dev/null || true
fi

[ "$cpu" -ge "$THRESHOLD" ] && cpu_streak=$((cpu_streak + 1)) || cpu_streak=0
[ "$ram" -ge "$THRESHOLD" ] && ram_streak=$((ram_streak + 1)) || ram_streak=0
[ "$disk" -ge "$THRESHOLD" ] && disk_streak=$((disk_streak + 1)) || disk_streak=0

now="$(date +%s)"
action="none"
cooldown="${NEXLIFY_RESOURCE_ACTION_COOLDOWN_SEC:-600}"
[[ "$cooldown" =~ ^[0-9]+$ ]] || cooldown=600

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG"
}

if [ "$((now - last_action))" -ge "$cooldown" ]; then
  if [ "$disk_streak" -ge "$SUSTAINED" ]; then
    action="disk_cleanup"
    journalctl --vacuum-size=256M >/dev/null 2>&1 || true
    find /tmp -maxdepth 1 -type f -name 'nexlify-*' -mtime +1 -delete 2>/dev/null || true
    find "$PANEL_DIR" -maxdepth 1 -type d \( -name '.next.old*' -o -name '.next.backup*' \) -mtime +1 \
      -exec rm -rf -- {} + 2>/dev/null || true
    last_action="$now"
  elif [ "$ram_streak" -ge "$SUSTAINED" ]; then
    action="memory_guard"
    if [ -x "$PANEL_DIR/scripts/nexlify-worker-wedge-guard.sh" ]; then
      PANEL_DIR="$PANEL_DIR" bash "$PANEL_DIR/scripts/nexlify-worker-wedge-guard.sh" >/dev/null 2>&1 || true
    fi
    last_action="$now"
  elif [ "$cpu_streak" -ge "$SUSTAINED" ]; then
    # CPU is hard-capped by install-resource-headroom.sh. Do not restart healthy
    # workers during legitimate load; record the pressure for the dashboard.
    action="cpu_capped"
    last_action="$now"
  fi
fi

cat > "$STATE" <<EOF
cpu_streak=$cpu_streak
ram_streak=$ram_streak
disk_streak=$disk_streak
last_action=$last_action
EOF

tmp="${SNAPSHOT}.tmp.$$"
printf '{"at":"%s","cpu":%d,"ram":%d,"disk":%d,"threshold":%d,"action":"%s"}\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$cpu" "$ram" "$disk" "$THRESHOLD" "$action" > "$tmp"
chmod 0644 "$tmp"
mv -f "$tmp" "$SNAPSHOT"

if [ "$cpu" -ge "$THRESHOLD" ] || [ "$ram" -ge "$THRESHOLD" ] || [ "$disk" -ge "$THRESHOLD" ]; then
  log "pressure cpu=${cpu}% ram=${ram}% disk=${disk}% threshold=${THRESHOLD}% action=${action}"
fi
