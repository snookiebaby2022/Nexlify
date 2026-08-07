#!/usr/bin/env bash
# Copy the panel license signing key to the marketing app so trials/licenses work.
# Run on VPS: bash scripts/setup-marketing-license-key.sh
# Safe — never uses 'exit' in a way that closes SSH; uses return in functions only.

set -u

MARKETING="${1:-/var/www/nexlify}"

find_panel_key() {
  for p in \
    /home/nexlify-panel/.license-keys/private.pem \
    /opt/nexlify-panel/.license-keys/private.pem \
    /root/Nexlify/.license-keys/private.pem; do
    if [ -f "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

echo "=== Marketing license key setup ==="
echo "Marketing app: $MARKETING"

if [ ! -d "$MARKETING" ]; then
  echo "ERROR: $MARKETING not found"
  echo "Done."
  return 0 2>/dev/null || true
fi

SRC="$(find_panel_key)" || SRC=""

if [ -z "$SRC" ]; then
  echo ""
  echo "No private.pem found on this server."
  echo "Generate on the PANEL repo first:"
  echo "  cd /home/nexlify-panel   # or /opt/nexlify-panel"
  echo "  npm run license:setup"
  echo ""
  echo "Then run this script again."
  echo "Done."
  return 0 2>/dev/null || true
fi

echo "Found panel key: $SRC"

DEST_DIR="$MARKETING/.license-keys"
mkdir -p "$DEST_DIR"
chmod 700 "$DEST_DIR"
cp "$SRC" "$DEST_DIR/private.pem"
chmod 600 "$DEST_DIR/private.pem"
echo "Copied to $DEST_DIR/private.pem"

# Optional: also copy public key for reference
PUB="${SRC%/private.pem}/public.pem"
[ -f "$PUB" ] && cp "$PUB" "$DEST_DIR/public.pem" && echo "Copied public.pem"

echo ""
echo "Restart marketing app:"
echo "  pm2 restart nexlify-web --update-env"
echo ""
echo "Test trial signing:"
echo "  cd $MARKETING && node -e \"require('fs').accessSync('.license-keys/private.pem')\" && echo 'Key readable OK'"
echo "Done."
