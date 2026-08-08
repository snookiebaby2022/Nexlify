#!/usr/bin/env bash
# Patch live panel.sh in place when GitHub raw is unavailable (private repo).
# Run on vendor VPS as root — paste entire script or upload via WinSCP.
#
#   bash /root/vps-patch-panel-installer.sh
set -euo pipefail

PANEL_SH="${1:-/var/www/nexlify/public/install/panel.sh}"

if [ ! -f "$PANEL_SH" ]; then
  echo "ERROR: $PANEL_SH not found"
  exit 1
fi

if grep -q 'detect_server_address' "$PANEL_SH" 2>/dev/null; then
  echo "OK: $PANEL_SH already has auto-detect IP"
  exit 0
fi

echo "Patching $PANEL_SH ..."
cp -a "$PANEL_SH" "${PANEL_SH}.bak.$(date +%s)"

# Prefer full replace from marketing bundle if present
for SRC in \
  "/var/www/nexlify/scripts/install-linux.sh" \
  "/home/nexlify-panel/scripts/install-linux.sh"; do
  if [ -f "$SRC" ] && grep -q 'detect_server_address' "$SRC" 2>/dev/null; then
    echo "Replacing from $SRC"
    cp -f "$SRC" "$PANEL_SH"
    chmod +x "$PANEL_SH"
    bash -n "$PANEL_SH"
    echo "OK: replaced with auto-detect installer"
    exit 0
  fi
done

# In-place patch for legacy panel.sh (--domain required / FATAL)
python3 << 'PY'
from pathlib import Path
import re
import sys

path = Path("/var/www/nexlify/public/install/panel.sh")
text = path.read_text()

detect_fn = '''
detect_server_address() {
  local ip fqdn
  if command -v curl >/dev/null 2>&1; then
    for url in "https://api.ipify.org" "https://ifconfig.me/ip" "https://icanhazip.com"; do
      ip="$(curl -fsSL --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
      if [[ "$ip" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then
        echo "$ip"
        return 0
      fi
    done
  fi
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [[ "$ip" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then
      echo "$ip"
      return 0
    fi
    fqdn="$(hostname -f 2>/dev/null || true)"
    if [ -n "$fqdn" ] && [ "$fqdn" != "localhost" ]; then
      echo "$fqdn"
      return 0
    fi
  fi
  echo "localhost"
}

if [ -z "$DOMAIN" ]; then
  log "Detecting server address..."
  DOMAIN="$(detect_server_address)"
  log "Using server address: $DOMAIN"
fi
'''

# Insert detect block after die()/log() definitions
if 'detect_server_address' in text:
    print("Already patched")
    sys.exit(0)

# Normalize legacy die/FATAL domain guard (multiple formats)
text = re.sub(
    r'\[ -n "\$DOMAIN" \] \|\| (?:die|echo "FATAL:| \{ echo "FATAL:)[^\n]*\n',
    '',
    text,
    flags=re.MULTILINE,
)
text = re.sub(
    r'^\s*echo "FATAL: --domain is required[^\n]*\n\s*exit 1\s*\n',
    '',
    text,
    flags=re.MULTILINE,
)

anchor = 'die() { echo "ERROR:'
if anchor not in text:
    anchor = 'FATAL:'
    if anchor not in text:
        print("ERROR: could not find anchor for patch", file=sys.stderr)
        sys.exit(1)
    # insert after first log/die block
    m = re.search(r'(log\(\).*?\n|die\(\).*?\n)', text)
    if not m:
        sys.exit("no log/die")
    insert_at = m.end()
else:
    m = re.search(r'die\(\) \{ echo "ERROR:.*?\n\}', text)
    insert_at = m.end() + 1 if m else text.find(anchor) + 200

text = text[:insert_at] + detect_fn + text[insert_at:]

# Add --ip alias if missing
if '--ip|--domain)' not in text and '--domain)' in text:
    text = text.replace('--domain)', '--ip|--domain)', 1)

# Update header comment
text = re.sub(
    r"panel\.sh\?v=[^\']+",
    "panel.sh?v=1.9.7",
    text,
    count=5,
)
text = text.replace('--domain YOUR_SERVER_IP', 'sudo bash')
text = text.replace('FATAL:', 'ERROR:')

path.write_text(text)
print("Patched in place")
PY

chmod +x "$PANEL_SH"
bash -n "$PANEL_SH"

if grep -q 'detect_server_address' "$PANEL_SH"; then
  echo "OK: auto-detect IP enabled"
  echo "Test: curl -fsSL 'https://nexlify.live/install/panel.sh?v=1.9.7' | head -8"
else
  echo "ERROR: patch failed — upload panel.sh from PC via WinSCP"
  exit 1
fi
