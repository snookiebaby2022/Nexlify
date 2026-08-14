#!/usr/bin/env bash
# Keep public /install/panel-sync.env as a comment-only stub.
# Never write PANEL_API_SECRET into a web-reachable file.
set -euo pipefail
ROOT="${1:-/var/www/nexlify}"
OUT="$ROOT/public/install/panel-sync.env"
mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<'EOF'
# Per-install PANEL_API_SECRET. New panels generate a unique key at install time.
# Do not publish a shared secret here — vendor remote-update uses the key each
# panel registers after license activation.
EOF
chmod 644 "$OUT"
echo "Wrote comment-only $OUT"
