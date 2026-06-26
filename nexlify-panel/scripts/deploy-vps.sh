#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Removing legacy in-process cron files (if present)..."
rm -f src/instrumentation.ts src/lib/cron-scheduler.ts
if [ -f src/instrumentation.ts ] || [ -f src/lib/cron-scheduler.ts ]; then
  echo "ERROR: legacy cron files still present — delete manually:"
  ls -la src/instrumentation.ts src/lib/cron-scheduler.ts 2>/dev/null || true
  exit 1
fi

echo "Installing dependencies..."
npm install --include=optional

# Next.js needs the Linux SWC binary on the VPS (warns if lockfile omits optional deps)
if [ "$(uname -s)" = "Linux" ]; then
  NEXT_VER="$(node -p "require('next/package.json').version" 2>/dev/null || echo 15.5.19)"
  echo "Ensuring @next/swc-linux-x64-gnu@${NEXT_VER}..."
  npm install --no-save "@next/swc-linux-x64-gnu@${NEXT_VER}" || true
fi

echo "Normalizing script line endings..."
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

echo "Syncing database schema..."
npx prisma db push --accept-data-loss

echo "Building production app..."
rm -rf .next
# Avoid intermittent ENOENT on pages-manifest.json (Next.js 15 worker race)
export NEXT_PRIVATE_WORKER_THREADS=false
npm run build

echo ""
echo "Ensuring panel env + PM2 (nginx upstream :3000)..."
chmod +x scripts/*.sh 2>/dev/null || true
if command -v pm2 >/dev/null 2>&1; then
  ./scripts/pm2-start.sh
  if ! ./scripts/pm2-boot-enabled.sh 2>/dev/null; then
    echo ""
    echo "One-time on this VPS (so the panel starts after reboot):"
    echo "  ./scripts/pm2-boot-enable.sh"
  fi
  echo ""
  echo "Deploy OK — panel upstream verified on 127.0.0.1:${PORT:-3000}"
else
  echo "Start manually:  npm run start"
  echo "Or install PM2:  sudo npm install -g pm2 && ./scripts/pm2-start.sh"
fi
