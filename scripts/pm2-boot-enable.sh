#!/usr/bin/env bash
# One-time setup: start PM2 and saved apps (nexlify, license) after server reboot.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Install PM2 first: sudo npm install -g pm2"
  exit 1
fi

if ./scripts/pm2-boot-enabled.sh 2>/dev/null; then
  echo "PM2 boot startup is already enabled."
  pm2 save
  exit 0
fi

user="${PM2_BOOT_USER:-$(whoami)}"
home_dir="${PM2_BOOT_HOME:-$HOME}"

echo "Configuring PM2 to start on boot for user: $user"
echo ""

startup_out="$(pm2 startup systemd -u "$user" --hp "$home_dir" 2>&1)" || true
echo "$startup_out"

sudo_cmd="$(echo "$startup_out" | grep -E '^sudo ' | head -1 || true)"

if [ -n "$sudo_cmd" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    echo "Running startup command as root..."
    eval "${sudo_cmd#sudo }"
  else
    echo ""
    echo "Run this command on the VPS (once, as root):"
    echo "  $sudo_cmd"
    echo ""
    echo "Then run:"
    echo "  cd $(pwd) && ./scripts/pm2-start.sh"
    exit 2
  fi
fi

if ! ./scripts/pm2-boot-enabled.sh 2>/dev/null; then
  echo "WARNING: Could not confirm pm2 systemd unit is enabled. Run the sudo command above manually."
  exit 2
fi

echo "PM2 will start on boot."
if [ -f ecosystem.config.cjs ]; then
  if ! pm2 describe nexlify >/dev/null 2>&1; then
    echo "Starting panel processes..."
    ./scripts/pm2-start.sh
  else
    pm2 save
  fi
fi

echo ""
pm2 status
