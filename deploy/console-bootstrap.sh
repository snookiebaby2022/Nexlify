#!/bin/bash
# Run this ON 85.17.162.54 via your host's WEB CONSOLE (browser terminal).
# No SSH from Windows required.
set -euo pipefail

APP_DIR="/var/www/nexlify"
ZIP_PATH="/tmp/nexlify-deploy.tar.gz"

echo "=== Nexlify console bootstrap ==="

if [ ! -f "$ZIP_PATH" ]; then
  echo ""
  echo "FIRST: Upload nexlify-deploy.tar.gz to $ZIP_PATH"
  echo "  On Windows (PowerShell), create the archive:"
  echo "    cd C:\\Users\\lizzi\\Projects\\stream-billing"
  echo "    tar -czf %TEMP%\\nexlify-deploy.tar.gz --exclude=node_modules --exclude=.next --exclude=.git --exclude=dev.db --exclude=.env ."
  echo "  Upload %TEMP%\\nexlify-deploy.tar.gz via your VPS file manager to /tmp/"
  echo ""
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl nginx build-essential python3

if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

mkdir -p "$APP_DIR"
tar -xzf "$ZIP_PATH" -C "$APP_DIR"
cd "$APP_DIR"
chmod +x deploy/remote-install.sh
bash deploy/remote-install.sh

echo "Done. Website: http://127.0.0.1:3001 | Panel: http://127.0.0.1:3000/panel via nginx"
