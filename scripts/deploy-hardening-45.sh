#!/usr/bin/env bash
# Deploy hardening 2.0.91 from local Windows repo → server 45 (match files + rebuild).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Git Bash / WSL path normalize
case "$ROOT" in
  /c/*|/d/*) ;;
  *)
    if command -v cygpath >/dev/null 2>&1; then ROOT="$(cygpath -u "$ROOT")"; fi
    ;;
esac
KEY="${NEXLIFY_SSH_KEY:-$HOME/.ssh/nexlify_deploy}"
REMOTE="${NEXLIFY_REMOTE:-root@45.88.138.18}"
REMOTE_DIR=/opt/nexlify-panel
cd "$ROOT"

SSH=(ssh -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=25 -o ServerAliveInterval=30)

echo "=== Local version ==="
node -p "require('./package.json').version"

FILES=(
  package.json
  package-lock.json
  HARDENING-BACKLOG.md
  docs/REDIS.md
  .github/workflows/ci.yml
  nginx.conf
  nginx/nexlify.conf
  prisma/schema.prisma
  prisma/migrations/20260910170000_conn_slots_epg_indexes/migration.sql
  scripts/iptv-edge-proxy.mjs
  scripts/edge-redis-slots.mjs
  scripts/edge-redis-auth.mjs
  scripts/check-live-routing-drift.sh
  scripts/apply-hardening-ops.sh
  scripts/ensure-db-pool-limit.cjs
  scripts/lock-live-routing-45.sh
  src/lib/redis.ts
  src/lib/connection-slots.ts
  src/lib/connection-slots.test.ts
  src/lib/connections.ts
  src/lib/connection-pulse.ts
  src/lib/playback-guard.ts
  src/lib/playback-marks.ts
  src/lib/panel-settings.ts
  src/lib/epg.ts
  src/lib/iptv-trial-lines.ts
  src/lib/iptv-trial-lines.test.ts
  src/lib/shop-checkout.ts
  src/lib/device-line-create.ts
  src/lib/nginx-agent-snippet.ts
  src/app/api/internal/live-auth/route.ts
  src/app/api/shop/checkout/route.ts
  src/app/api/shop/paypal/capture/route.ts
  src/app/api/admin/lines/route.ts
  src/app/api/admin/lines/[id]/route.ts
  src/app/api/admin/mag/route.ts
  src/app/api/admin/enigma/route.ts
  src/app/admin/settings/streams/page.tsx
  src/components/server-edge-auth-panel.tsx
  marketing-drop-in/public/install/scripts/iptv-edge-proxy.mjs
  marketing-drop-in/public/install/scripts/edge-redis-slots.mjs
)

MISSING=0
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "MISSING local: $f" >&2
    MISSING=1
  fi
done
[ "$MISSING" -eq 0 ] || exit 1

echo "=== Unlock edge/nginx immutables if locked ==="
"${SSH[@]}" "$REMOTE" "bash scripts/lock-live-routing-45.sh unlock 2>/dev/null || chattr -i /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs 2>/dev/null || true" || true

echo "=== Sync ${#FILES[@]} files to $REMOTE:$REMOTE_DIR ==="
printf '%s\n' "${FILES[@]}" | tar -czf - -T - | \
  "${SSH[@]}" "$REMOTE" "tar -C '$REMOTE_DIR' -xzf - && cd '$REMOTE_DIR' && sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true && chmod +x scripts/*.sh scripts/*.mjs 2>/dev/null || true"

echo "=== Verify matching hashes (sample) ==="
for f in package.json src/lib/connection-slots.ts scripts/iptv-edge-proxy.mjs scripts/edge-redis-slots.mjs src/lib/redis.ts; do
  LOCAL_HASH=$(sha256sum "$f" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$f" | awk '{print $1}')
  REMOTE_HASH=$("${SSH[@]}" "$REMOTE" "sha256sum '$REMOTE_DIR/$f' | awk '{print \$1}'")
  if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    echo "OK $f"
  else
    echo "MISMATCH $f local=$LOCAL_HASH remote=$REMOTE_HASH" >&2
    exit 1
  fi
done

echo "=== Remote version before rebuild ==="
"${SSH[@]}" "$REMOTE" "node -p \"require('$REMOTE_DIR/package.json').version\""

echo "=== Migrate + rebuild + lock (protected 45) ==="
"${SSH[@]}" "$REMOTE" "cd '$REMOTE_DIR' && \
  export NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT=1 NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 && \
  npx prisma generate && \
  npx prisma migrate deploy && \
  bash scripts/apply-panel-fast-update.sh build-prep && \
  bash scripts/apply-panel-fast-update.sh build-compile && \
  bash scripts/apply-panel-fast-update.sh swap && \
  bash scripts/check-live-routing-drift.sh || true && \
  bash scripts/lock-live-routing-45.sh || true && \
  pm2 restart nexlify-cron --update-env || true && \
  sleep 4 && \
  curl -fsS -m 15 http://127.0.0.1:13000/api/health && echo && \
  node -p \"require('./package.json').version\" && \
  grep -n 'REDIS_SLOTS_URL\\|tryAcquireConnSlot\\|edge-redis-slots' scripts/iptv-edge-proxy.mjs src/lib/connection-slots.ts | head -n 20"

echo "=== Push edge files to 10gbs if script exists ==="
"${SSH[@]}" "$REMOTE" "cd '$REMOTE_DIR' && \
  if [ -f scripts/deploy-10gbs-edge-from-panel.cjs ]; then \
    node scripts/deploy-10gbs-edge-from-panel.cjs || true; \
  elif [ -f tmp/deploy-conn-fix-edge.cjs ]; then \
    node tmp/deploy-conn-fix-edge.cjs || true; \
  else echo 'no edge deploy helper'; fi"

echo "=== DONE 2.0.91 on server 45 ==="
