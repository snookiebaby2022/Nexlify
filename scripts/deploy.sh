#!/bin/bash
# Deploy script for Nexlify panel + marketing site
# Run from local machine: bash scripts/deploy.sh [panel|marketing|all]

set -e

VPS_HOST="${DEPLOY_HOST:-your-vps-host}"
VPS_USER="${DEPLOY_USER:-root}"
PANEL_PATH="/home/nexlify/nexlify-panel"
MARKETING_PATH="/var/www/nexlify"

deploy_panel() {
  echo ">>> Deploying panel..."
  ssh $VPS_USER@$VPS_HOST << 'EOF'
    cd /home/nexlify/nexlify-panel
    git pull origin main
    npm install --production=false
    npm run build
    pm2 restart nexlify || pm2 start npm --name nexlify -- start
    echo "✅ Panel deployed"
EOF
}

deploy_marketing() {
  echo ">>> Deploying marketing site..."
  ssh $VPS_USER@$VPS_HOST << 'EOF'
    cd /var/www/nexlify
    git pull origin main
    npm install
    npm run build
    pm2 restart nexlify-web || pm2 start npm --name nexlify-web -- start --port 3001
    echo "✅ Marketing site deployed"
EOF
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
    echo "Usage: bash scripts/deploy.sh [panel|marketing|all]"
    exit 1
    ;;
esac

echo ">>> Done!"
