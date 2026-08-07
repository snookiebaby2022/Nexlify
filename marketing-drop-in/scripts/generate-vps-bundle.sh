#!/usr/bin/env bash
# Regenerate marketing-drop-in/scripts/vps-full-update.sh from current source.
# Run from repo root: bash marketing-drop-in/scripts/generate-vps-bundle.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/scripts/vps-full-update.sh"
TMP="$(mktemp -d)"
TAR="$TMP/marketing-src.tgz"

trap 'rm -rf "$TMP"' EXIT

echo "=== Generating vps-full-update.sh ==="
echo "Source: $ROOT"

tar czf "$TAR" -C "$ROOT" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='src/generated' \
  .

B64="$(base64 -w 0 "$TAR" 2>/dev/null || base64 "$TAR" | tr -d '\n')"

cat > "$OUT" << 'HEADER'
#!/usr/bin/env bash
# Nexlify marketing — full VPS update (no git/GitHub required).
# Run as root: bash vps-full-update.sh
# Upload this ONE file to the server via WinSCP, then run it.
# Regenerate after source changes: bash marketing-drop-in/scripts/generate-vps-bundle.sh

set -u
MARKETING="${1:-/var/www/nexlify}"

echo "=== Nexlify marketing full update ==="
echo "Target: $MARKETING"
echo ""

if [ ! -d "$MARKETING" ]; then
  echo "ERROR: $MARKETING not found"
  echo "Done."
  exit 1
fi

# --- 1) Extract bundled source ---
echo "-> Extracting latest marketing source..."
BUNDLE="$(mktemp)"
cat > "$BUNDLE" << 'BUNDLE_EOF'
HEADER

echo "$B64" >> "$OUT"

cat >> "$OUT" << 'FOOTER'
BUNDLE_EOF

base64 -d "$BUNDLE" | tar xzf - -C "$MARKETING" 2>/dev/null || {
  base64 -d "$BUNDLE" > /tmp/mk-bundle.tgz
  tar xzf /tmp/mk-bundle.tgz -C "$MARKETING"
}
rm -f "$BUNDLE" /tmp/mk-bundle.tgz
echo "   Source extracted."

# --- 2) License signing key from panel ---
echo "-> License signing key..."
for SRC in /home/nexlify-panel/.license-keys/private.pem /opt/nexlify-panel/.license-keys/private.pem; do
  if [ -f "$SRC" ]; then
    mkdir -p "$MARKETING/.license-keys"
    chmod 700 "$MARKETING/.license-keys"
    cp "$SRC" "$MARKETING/.license-keys/private.pem"
    chmod 600 "$MARKETING/.license-keys/private.pem"
    echo "   Copied from $SRC"
    break
  fi
done
if [ ! -f "$MARKETING/.license-keys/private.pem" ]; then
  echo "   WARNING: No panel private.pem found — generate with: cd /home/nexlify-panel && npm run license:setup"
fi

# --- 2b) Sync .env from panel (no PEM in .env) ---
if [ -f "$MARKETING/scripts/setup-marketing-env.sh" ]; then
  echo "-> Syncing marketing .env from panel..."
  bash "$MARKETING/scripts/setup-marketing-env.sh" "$MARKETING"
fi

# --- 3) Remove build breaker ---
rm -f "$MARKETING/prisma.config.ts"

# --- 4) Create marketing DB tables if missing ---
echo "-> Ensuring marketing database schema..."
cd "$MARKETING"
if command -v npx >/dev/null 2>&1; then
  for ENV_CAND in "$MARKETING/.env" /home/nexlify-panel/.env /opt/nexlify-panel/.env; do
    if [ -f "$ENV_CAND" ]; then
      DB_LINE="$(grep -m1 '^DATABASE_URL=' "$ENV_CAND" 2>/dev/null || true)"
      if [ -n "$DB_LINE" ]; then
        export DATABASE_URL="${DB_LINE#DATABASE_URL=}"
        export DATABASE_URL="${DATABASE_URL#\"}"
        export DATABASE_URL="${DATABASE_URL%\"}"
        echo "   DATABASE_URL from $ENV_CAND"
        break
      fi
    fi
  done
  npx prisma db push --accept-data-loss 2>&1 | tail -5
fi

# --- 5) Sync database plans ---
echo "-> Syncing plans (trial + £50 nexlify)..."
cd "$MARKETING"
if command -v npx >/dev/null 2>&1; then
  npm install --include=dev --no-audit --no-fund 2>&1 | tail -2
  for ENV_CAND in "$MARKETING/.env" /home/nexlify-panel/.env /opt/nexlify-panel/.env; do
    if [ -f "$ENV_CAND" ]; then
      DB_LINE="$(grep -m1 '^DATABASE_URL=' "$ENV_CAND" 2>/dev/null || true)"
      if [ -n "$DB_LINE" ]; then
        export DATABASE_URL="${DB_LINE#DATABASE_URL=}"
        export DATABASE_URL="${DATABASE_URL#\"}"
        export DATABASE_URL="${DATABASE_URL%\"}"
        echo "   DATABASE_URL from $ENV_CAND"
        break
      fi
    fi
  done
  npx tsx scripts/sync-plans-vps.ts 2>&1 || echo "   Plan sync failed — check DATABASE_URL in .env"
else
  echo "   npx not found — skip plan sync"
fi

# --- 6) Rebuild ---
echo "-> Building..."
rm -rf .next src/generated/prisma
npx prisma generate 2>&1 | tail -1
npm run build 2>&1 | tail -5

if [ ! -f .next/BUILD_ID ]; then
  echo "ERROR: Build failed — check output above"
  echo "Done."
  exit 1
fi

# --- 7) Restart ---
echo "-> Restarting PM2..."
pm2 restart nexlify-web --update-env 2>&1 | tail -2
pm2 save 2>/dev/null || true
sleep 3

# --- 8) Verify ---
echo ""
echo "=== Verification ==="
curl -s "http://127.0.0.1:13001/pricing" 2>/dev/null | grep -oE 'September 1, 2026|Nexlify License|7-Day Trial' | sort -u | head -10
echo ""
if [ -f .license-keys/private.pem ]; then echo "License key: OK"; else echo "License key: MISSING"; fi
grep -q 'isFreePeriod()' src/app/api/checkout/route.ts 2>/dev/null && echo "Free checkout: OK" || echo "Free checkout: check checkout route"
grep -q '^STRIPE_SECRET_KEY=sk_' .env 2>/dev/null && echo "Stripe: configured" || echo "Stripe: not set (needed after Sep 1 promo)"
grep -q '^DATABASE_URL=' .env 2>/dev/null && echo "Database: configured" || echo "Database: MISSING"
echo ""
echo "=== Update complete ==="
echo "Hard-refresh https://nexlify.live/pricing (Ctrl+Shift+R)"
FOOTER

chmod +x "$OUT"
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
