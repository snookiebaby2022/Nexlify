#!/bin/bash
# Quick deploy - run ON the VPS after git pull
# Usage: bash deploy-vps.sh [panel|marketing|all]

set -e

deploy_panel() {
  echo ">>> Deploying panel..."
  cd /home/nexlify-panel
  git pull origin main
  npm install --production=false
  npm run build
  pm2 restart nexlify || pm2 start npm --name nexlify -- start
  echo "✅ Panel deployed"
}

deploy_marketing() {
  echo ">>> Deploying marketing site..."
  cd /var/www/nexlify
  git pull origin main
  npm install
  npm run build
  pm2 restart nexlify-web || pm2 start npm --name nexlify-web -- start --port 3001
  echo "✅ Marketing site deployed"
}

case "${1:-all}" in
  panel)
    deploy_panel
    ;;
  marketing)
    deploy_marketing
    ;;
  all)
    deploy_panel
    deploy_marketing
    ;;
  *)
    echo "Usage: bash deploy-vps.sh [panel|marketing|all]"
    exit 1
    ;;
esac

echo ">>> Done!"
