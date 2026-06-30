#!/usr/bin/env bash
# Dry-run the one-click installer payload (no apt/systemd/nginx/postgres).
# Usage: bash scripts/install-dry-run.sh
set -euo pipefail

PANEL_SH_URL="${PANEL_SH_URL:-https://nexlify.live/install/panel.sh?v=161}"
TARBALL_URL="${TARBALL_URL:-https://nexlify.live/downloads/nexlify-panel.tar.gz?v=161}"
WORKDIR="$(mktemp -d /tmp/nexlify-dryrun.XXXXXX)"
PANEL_DIR="$WORKDIR/panel"
FAIL=0

pass() { echo "  OK   $*"; }
fail() { echo "  FAIL $*"; FAIL=1; }

echo "=== Nexlify one-click installer dry run ==="
echo "Workdir: $WORKDIR"
echo ""

echo "[1] Download panel.sh"
sh_tmp="$WORKDIR/panel.sh"
if curl -fsSL "$PANEL_SH_URL" -o "$sh_tmp"; then
  bytes="$(wc -c < "$sh_tmp" | tr -d ' ')"
  if [ "$bytes" -lt 8000 ]; then fail "panel.sh too small ($bytes bytes)"; else pass "panel.sh ($bytes bytes)"; fi
else
  fail "could not download panel.sh"
fi

echo "[2] Download panel tarball"
tar_tmp="$WORKDIR/nexlify-panel.tar.gz"
if curl -fsSL "$TARBALL_URL" -o "$tar_tmp"; then
  bytes="$(wc -c < "$tar_tmp" | tr -d ' ')"
  if [ "$bytes" -lt 2000000 ]; then fail "tarball too small ($bytes bytes)"; else pass "tarball ($bytes bytes)"; fi
else
  fail "could not download tarball"
fi

echo "[3] Extract + required files"
mkdir -p "$PANEL_DIR"
tar -xzf "$tar_tmp" -C "$PANEL_DIR"
for f in \
  package.json \
  package-lock.json \
  .env.example \
  prisma/schema.prisma \
  scripts/pm2-start.sh \
  scripts/set-admin-password.cjs \
  src/lib/lines.ts \
  src/lib/panel-releases.json \
  nginx/panel.nexlify.live-http-only.conf
do
  if [ -f "$PANEL_DIR/$f" ]; then pass "$f"; else fail "missing $f"; fi
done

if grep -q '"name": "nexlify"' "$PANEL_DIR/package.json" 2>/dev/null; then
  pass "package.json name=nexlify"
else
  fail "package.json missing nexlify name"
fi

echo "[4] panel.sh syntax + key hooks"
if bash -n "$sh_tmp"; then pass "bash -n panel.sh"; else fail "panel.sh syntax error"; fi
for needle in panel_install_complete download_panel_archive 'db push --accept-data-loss' panel-releases.json progress_step save_install_credentials verify-install-smoke ensure-panel-env sync-license-env; do
  if grep -q "$needle" "$sh_tmp"; then pass "panel.sh contains: $needle"; else fail "panel.sh missing: $needle"; fi
done

echo "[5] npm ci + prisma generate"
cd "$PANEL_DIR"
cp .env.example .env
export NPM_CONFIG_LOGLEVEL=error
export PRISMA_HIDE_UPDATE_MESSAGE=1
export CI=1
export NEXT_TELEMETRY_DISABLED=1
if npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1; then pass "npm ci"; else fail "npm ci"; fi
if npx prisma generate >/dev/null 2>&1; then pass "prisma generate"; else fail "prisma generate"; fi

echo "[6] production build"
if [ "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)" -lt 2500000 ] && ! swapon --show 2>/dev/null | grep -q .; then
  echo "  .. adding 2G swap for build"
  fallocate -l 2G /tmp/nexlify-dryrun-swap 2>/dev/null || dd if=/dev/zero of=/tmp/nexlify-dryrun-swap bs=1M count=2048 status=none
  chmod 600 /tmp/nexlify-dryrun-swap
  mkswap /tmp/nexlify-dryrun-swap >/dev/null
  swapon /tmp/nexlify-dryrun-swap 2>/dev/null || true
fi
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
if npm run build >"$WORKDIR/build.log" 2>&1; then pass "npm run build"; else fail "npm run build"; tail -20 "$WORKDIR/build.log" >&2; fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "=== DRY RUN PASSED ==="
  swapon --show 2>/dev/null | grep -q nexlify-dryrun-swap && swapoff /tmp/nexlify-dryrun-swap 2>/dev/null || true
  rm -f /tmp/nexlify-dryrun-swap 2>/dev/null || true
  rm -rf "$WORKDIR"
  exit 0
else
  echo "=== DRY RUN FAILED ==="
  echo "Artifacts kept at: $WORKDIR"
  exit 1
fi
