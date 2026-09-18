#!/usr/bin/env bash
# Install logrotate rules for Nexlify panel cron/ops logs (run as root on panel host).
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

cat > /etc/logrotate.d/nexlify-panel <<'EOF'
/var/log/nexlify-*.log {
    daily
    rotate 14
    size 20M
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    sharedscripts
    postrotate
        command -v pm2 >/dev/null 2>&1 && pm2 flush >/dev/null 2>&1 || true
    endscript
}
EOF

echo "Installed /etc/logrotate.d/nexlify-panel"
logrotate -d /etc/logrotate.d/nexlify-panel 2>&1 | head -5 || true
