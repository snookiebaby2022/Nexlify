#!/usr/bin/env bash
# Keep PM2 panel workloads below a configurable share of host CPU and RAM.
# Applies cgroup limits live; no service restart and no playback interruption.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root" >&2; exit 1; }
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
ENV_FILE="$PANEL_DIR/.env"
THRESHOLD="${NEXLIFY_RESOURCE_HEADROOM_PERCENT:-75}"

[[ "$THRESHOLD" =~ ^[0-9]+$ ]] || THRESHOLD=75
[ "$THRESHOLD" -lt 50 ] && THRESHOLD=50
[ "$THRESHOLD" -gt 90 ] && THRESHOLD=90

cores="$(nproc)"
cpu_quota=$((cores * THRESHOLD))
mem_total_kb="$(awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo)"
mem_max_bytes=$((mem_total_kb * 1024 * THRESHOLD / 100))
mem_high_bytes=$((mem_total_kb * 1024 * (THRESHOLD - 5) / 100))
pm2_unit=""
for candidate in pm2-root.service pm2-nexlify.service; do
  if systemctl cat "$candidate" >/dev/null 2>&1; then
    pm2_unit="$candidate"
    break
  fi
done

if [ -n "$pm2_unit" ]; then
  # A quota of 600% on an 8-core host means 75% of total host CPU.
  systemctl set-property "$pm2_unit" \
    "CPUQuota=${cpu_quota}%" \
    "MemoryHigh=${mem_high_bytes}" \
    "MemoryMax=${mem_max_bytes}"
  echo "Applied $pm2_unit CPUQuota=${cpu_quota}% MemoryMax=${THRESHOLD}%"
else
  echo "WARN: PM2 systemd unit not found; monitoring remains enabled" >&2
fi

if [ -f "$ENV_FILE" ]; then
  python3 - "$ENV_FILE" "$THRESHOLD" <<'PY'
import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
threshold = sys.argv[2]
updates = {
    "NEXLIFY_RESOURCE_HEADROOM_PERCENT": threshold,
    "NEXLIFY_RESOURCE_SUSTAINED_SAMPLES": "3",
    "NEXLIFY_RESOURCE_ACTION_COOLDOWN_SEC": "600",
}
lines = path.read_text().splitlines()
seen = set()
out = []
for line in lines:
    key = line.split("=", 1)[0].strip() if "=" in line else ""
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
tmp = path.with_name(path.name + ".headroom.tmp")
tmp.write_text("\n".join(out) + "\n")
os.chmod(tmp, path.stat().st_mode)
os.replace(tmp, path)
PY
fi

cat > /etc/logrotate.d/nexlify-resource-guards <<'EOF'
/var/log/nexlify-resource-guard.log /var/log/nexlify-wedge-guard.log /var/log/nexlify-watchdog.log {
    daily
    rotate 7
    size 25M
    compress
    missingok
    notifempty
    copytruncate
}
EOF

chmod +x "$PANEL_DIR/scripts/nexlify-resource-guard.sh"
tmp="$(mktemp)"
(crontab -l 2>/dev/null || true) |
  grep -v 'nexlify-resource-guard.sh' > "$tmp"
cat >> "$tmp" <<CRON
* * * * * PANEL_DIR=$PANEL_DIR $PANEL_DIR/scripts/nexlify-resource-guard.sh
CRON
crontab "$tmp"
rm -f "$tmp"

PANEL_DIR="$PANEL_DIR" "$PANEL_DIR/scripts/nexlify-resource-guard.sh"
echo "RESOURCE_HEADROOM_OK threshold=${THRESHOLD}%"
