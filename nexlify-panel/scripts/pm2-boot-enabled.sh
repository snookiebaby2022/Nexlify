#!/usr/bin/env bash
# Exit 0 if PM2 is configured to resurrect apps on boot (systemd).
set -euo pipefail

if ! command -v systemctl >/dev/null 2>&1; then
  exit 1
fi

user="${PM2_BOOT_USER:-$(whoami)}"
if systemctl is-enabled "pm2-${user}" >/dev/null 2>&1; then
  exit 0
fi
if systemctl is-enabled "pm2-${user}.service" >/dev/null 2>&1; then
  exit 0
fi
# Some installs use pm2-root or a generic pm2.service
if systemctl is-enabled pm2-root >/dev/null 2>&1; then
  exit 0
fi
if systemctl list-unit-files --type=service 2>/dev/null | grep -qE '^pm2-.*\.service\s+enabled'; then
  exit 0
fi
exit 1
