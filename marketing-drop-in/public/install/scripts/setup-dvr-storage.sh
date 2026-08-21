#!/usr/bin/env bash
# Create disk-backed DVR storage and wire DVR_STORAGE_ROOT into panel .env (installer + updates).
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DVR_ROOT="${DVR_STORAGE_ROOT:-/var/nexlify/dvr}"
DVR_PARENT="$(dirname "$DVR_ROOT")"

mkdir -p "$DVR_ROOT"

# Ensure a dedicated service user exists (installer convention).
if ! id nexlify &>/dev/null; then
  useradd -r -d /var/lib/nexlify -s /usr/sbin/nologin nexlify 2>/dev/null || true
fi

if id nexlify &>/dev/null; then
  chown -R nexlify:nexlify "$DVR_PARENT"
else
  # Fallback: match panel tree owner (common when PM2 runs as root).
  local_owner="$(stat -c '%U:%G' "$PANEL_DIR" 2>/dev/null || echo root:root)"
  chown -R "$local_owner" "$DVR_PARENT"
fi

chmod 755 "$DVR_PARENT"
chmod 775 "$DVR_ROOT"

touch "$PANEL_DIR/.env"
sed -i 's/\r$//' "$PANEL_DIR/.env" 2>/dev/null || true

set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$PANEL_DIR/.env" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$PANEL_DIR/.env"
  else
    echo "${k}=${v}" >> "$PANEL_DIR/.env"
  fi
}

set_kv DVR_STORAGE_ROOT "$DVR_ROOT"
echo "DVR storage: ${DVR_ROOT} (owner: $(stat -c '%U:%G' "$DVR_ROOT" 2>/dev/null || echo unknown))"
